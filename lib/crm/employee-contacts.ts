import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase-server";
import {
  getCurrentUserAccess,
  requireAuthenticatedAccess,
} from "@/lib/crm/access";
import {
  EMPLOYEE_BUSINESS_CARD_MAX_BYTES,
  EMPLOYEE_BUSINESS_CARD_MIME,
  EMPLOYEE_BUSINESS_CARDS_BUCKET,
} from "@/lib/crm/quote-constants";
import type { Employee, Team } from "@/types/database";

function fileExt(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png" || ext === "webp" || ext === "gif") return ext;
  return "jpg";
}

function assertBusinessCardFile(file: File) {
  if (file.size <= 0 || file.size > EMPLOYEE_BUSINESS_CARD_MAX_BYTES) {
    throw new Error("명함 이미지는 10MB 이하여야 합니다.");
  }
  const mime = (file.type || "").toLowerCase();
  if (
    mime &&
    !(EMPLOYEE_BUSINESS_CARD_MIME as readonly string[]).includes(mime)
  ) {
    throw new Error("명함은 JPG/PNG/WEBP/GIF만 업로드할 수 있습니다.");
  }
}

export async function listCompanyEmployeesForContact(): Promise<{
  employees: Employee[];
  teams: Team[];
  currentEmployeeId: string | null;
  canManageAll: boolean;
  canAccessErp: boolean;
  isAuthenticated: boolean;
  loadError: string | null;
}> {
  const access = await getCurrentUserAccess();
  if (!access.isAuthenticated || !access.userId) {
    return {
      employees: [],
      teams: [],
      currentEmployeeId: null,
      canManageAll: false,
      canAccessErp: false,
      isAuthenticated: false,
      loadError: "로그인이 필요합니다.",
    };
  }

  if (!access.canAccessErp) {
    return {
      employees: [],
      teams: [],
      currentEmployeeId: access.profile?.employee_id ?? null,
      canManageAll: false,
      canAccessErp: false,
      isAuthenticated: true,
      loadError: "관리자 승인 후 이용할 수 있습니다.",
    };
  }

  const supabase = await createClient();

  const { data: companyRole } = await supabase.rpc("current_company_role");
  const role = typeof companyRole === "string" ? companyRole : null;
  const canManageAll =
    access.isAdmin ||
    role === "owner" ||
    role === "director" ||
    role === "admin";

  const employeeSelect =
    "id, company_id, team_id, name, title, phone, email, business_card_path, show_business_card_on_quote, is_active, sort_order, created_at, updated_at";

  let empQuery = supabase
    .from("employees")
    .select(employeeSelect)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!canManageAll) {
    const myId = access.profile?.employee_id ?? null;
    if (!myId) {
      return {
        employees: [],
        teams: [],
        currentEmployeeId: null,
        canManageAll: false,
        canAccessErp: true,
        isAuthenticated: true,
        loadError: "연결된 직원 정보가 없습니다.",
      };
    }
    empQuery = empQuery.eq("id", myId);
  }

  const [empRes, teamRes] = await Promise.all([
    empQuery,
    supabase
      .from("teams")
      .select("id, name, sort_order, created_at")
      .order("sort_order", { ascending: true }),
  ]);

  if (empRes.error) {
    return {
      employees: [],
      teams: [],
      currentEmployeeId: access.profile?.employee_id ?? null,
      canManageAll,
      canAccessErp: true,
      isAuthenticated: true,
      loadError:
        "직원 정보를 불러오지 못했습니다. migration 36 적용 여부를 확인해 주세요.",
    };
  }

  return {
    employees: (empRes.data ?? []) as Employee[],
    teams: (teamRes.data ?? []) as Team[],
    currentEmployeeId: access.profile?.employee_id ?? null,
    canManageAll,
    canAccessErp: true,
    isAuthenticated: true,
    loadError: null,
  };
}

export async function uploadEmployeeBusinessCard(input: {
  employeeId: string;
  companyId: string;
  file: File;
}): Promise<string> {
  await requireAuthenticatedAccess();
  assertBusinessCardFile(input.file);

  const ext = fileExt(input.file.name);
  const path = `${input.companyId}/${input.employeeId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(EMPLOYEE_BUSINESS_CARDS_BUCKET)
    .upload(path, bytes, {
      contentType: input.file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: false,
    });

  if (error) {
    throw new Error("명함 이미지 업로드에 실패했습니다.");
  }

  return path;
}

export async function updateEmployeeContactProfile(input: {
  employeeId: string;
  title: string;
  phone: string | null;
  email: string | null;
  businessCardPath?: string | null;
  clearBusinessCard?: boolean;
  showBusinessCardOnQuote: boolean;
}): Promise<Employee> {
  await requireAuthenticatedAccess();
  const title = input.title.trim();
  if (!title) throw new Error("직책을 입력해 주세요.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_employee_contact_profile", {
    p_employee_id: input.employeeId,
    p_title: title,
    p_phone: input.phone,
    p_email: input.email,
    p_business_card_path: input.businessCardPath ?? null,
    p_clear_business_card: Boolean(input.clearBusinessCard),
    p_show_business_card_on_quote: input.showBusinessCardOnQuote,
  });

  if (error) {
    throw new Error(error.message || "직원 정보 저장에 실패했습니다.");
  }

  return data as Employee;
}

export async function createSignedEmployeeCardUrl(
  filePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const path = String(filePath ?? "").trim();
  if (!path) throw new Error("명함 경로가 없습니다.");
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(EMPLOYEE_BUSINESS_CARDS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error("명함 링크 생성에 실패했습니다.");
  }
  return data.signedUrl;
}
