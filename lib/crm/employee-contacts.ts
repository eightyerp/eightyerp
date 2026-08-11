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

export type EmployeeMaster = Employee & {
  merged_into_employee_id: string | null;
  merged_at: string | null;
  merged_by: string | null;
  profile_id: string | null;
  login_email: string | null;
  login_linked: boolean;
  login_active: boolean;
  approval_status: string | null;
  role: string | null;
  permissions: Record<string, boolean>;
  last_sign_in_at: string | null;
  customer_count: number;
  quote_count: number;
  schedule_count: number;
};

export type EmployeeMergeReference = {
  schema: string;
  table: string;
  column: string;
  kind: "business" | "login" | "history";
  source_count: number;
  target_count: number;
  combined_count: number;
};

export type EmployeeMergeLogin = {
  profile_id: string;
  employee_id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  role: string;
};

export type EmployeeMergeImpact = {
  source: { id: string; name: string; is_active: boolean; merged_into_employee_id: string | null };
  target: { id: string; name: string; is_active: boolean; merged_into_employee_id: string | null };
  references: EmployeeMergeReference[];
  logins: EmployeeMergeLogin[];
};

export type EmployeeMergeResult = {
  merge_log_id: string;
  source_employee_id: string;
  target_employee_id: string;
  transferred_counts: Record<string, number>;
  before_totals: Record<string, number>;
  after_totals: Record<string, number>;
};

export type EmployeeMasterEvent = {
  id: string;
  employee_id: string;
  event_type: string;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  detail: Record<string, unknown>;
  created_at: string;
};

export const EMPLOYEE_MASTER_REQUIRED_RPCS = [
  "list_employee_master",
  "create_employee_master",
  "update_employee_master",
  "transfer_employee_assignments",
  "unlink_employee_login",
  "update_employee_login_role",
  "approve_staff_signup",
  "list_employee_merge_states",
  "get_employee_merge_impact",
  "merge_employees",
] as const;

export function isMissingEmployeeMasterMigrationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /Could not find the function|does not exist/i.test(error.message ?? "");
}

export async function listEmployeeMasterEvents(): Promise<EmployeeMasterEvent[]> {
  await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_master_events")
    .select("id, employee_id, event_type, before_data, after_data, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeMasterEvent[];
}

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
  employees: EmployeeMaster[];
  teams: Team[];
  currentEmployeeId: string | null;
  canManageAll: boolean;
  canMergeEmployees: boolean;
  canManageLoginAccounts: boolean;
  canAssignAdminRole: boolean;
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
      canMergeEmployees: false,
      canManageLoginAccounts: false,
      canAssignAdminRole: false,
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
      canMergeEmployees: false,
      canManageLoginAccounts: false,
      canAssignAdminRole: false,
      canAccessErp: false,
      isAuthenticated: true,
      loadError: "관리자 승인 후 이용할 수 있습니다.",
    };
  }

  const supabase = await createClient();

  const { data: companyRole } = await supabase.rpc("current_company_role");
  const role = typeof companyRole === "string" ? companyRole : null;
  const canManageAll =
    role === "owner" || role === "director" || role === "admin";
  // Keep this in sync with get_employee_merge_impact/merge_employees RPC guards.
  const canMergeEmployees = canManageAll;
  const canManageLoginAccounts = canManageAll;
  const canAssignAdminRole = role === "owner" || role === "director";

  const employeeSelect =
    "id, company_id, team_id, name, title, phone, email, business_card_path, show_business_card_on_quote, is_active, sort_order, created_at, updated_at";

  let empQuery = supabase
    .from("employees")
    .select(employeeSelect)
    .order("sort_order", { ascending: true });

  if (!canManageAll) {
    const myId = access.profile?.employee_id ?? null;
    if (!myId) {
      return {
        employees: [],
        teams: [],
        currentEmployeeId: null,
        canManageAll: false,
        canMergeEmployees: false,
        canManageLoginAccounts: false,
        canAssignAdminRole: false,
        canAccessErp: true,
        isAuthenticated: true,
        loadError: "연결된 직원 정보가 없습니다.",
      };
    }
    empQuery = empQuery.eq("id", myId).eq("is_active", true);
  }

  const [masterRes, empRes, teamRes, mergeStateRes] = await Promise.all([
    canManageAll ? supabase.rpc("list_employee_master") : Promise.resolve({ data: null, error: null }),
    empQuery,
    supabase
      .from("teams")
      .select("id, name, sort_order, created_at")
      .order("sort_order", { ascending: true }),
    canManageAll
      ? supabase.rpc("list_employee_merge_states")
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (empRes.error) {
    return {
      employees: [],
      teams: [],
      currentEmployeeId: access.profile?.employee_id ?? null,
      canManageAll,
      canMergeEmployees,
      canManageLoginAccounts,
      canAssignAdminRole,
      canAccessErp: true,
      isAuthenticated: true,
      loadError:
        "직원 정보를 불러오지 못했습니다. migration 36 적용 여부를 확인해 주세요.",
    };
  }

  const fallbackEmployees = ((empRes.data ?? []) as Employee[]).map((employee) => ({
    ...employee,
    profile_id: null,
    login_email: null,
    login_linked: false,
    login_active: false,
    approval_status: null,
    role: null,
    permissions: {},
    last_sign_in_at: null,
    customer_count: 0,
    quote_count: 0,
    schedule_count: 0,
    merged_into_employee_id: null,
    merged_at: null,
    merged_by: null,
  }));
  const mergeStateByEmployee = new Map(
    ((mergeStateRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      row.employee_id as string,
      row,
    ]),
  );
  const masterEmployees = !masterRes.error && masterRes.data
    ? (masterRes.data as Array<Record<string, unknown>>).map((row) => {
        const mergeState = mergeStateByEmployee.get(row.employee_id as string);
        return ({
        id: row.employee_id as string,
        company_id: row.company_id as string,
        team_id: (row.team_id as string | null) ?? null,
        name: row.employee_name as string,
        title: row.employee_title as string,
        phone: (row.employee_phone as string | null) ?? null,
        email: (row.employee_email as string | null) ?? null,
        business_card_path: (row.business_card_path as string | null) ?? null,
        show_business_card_on_quote: Boolean(row.show_business_card_on_quote),
        is_active: Boolean(row.employee_is_active),
        sort_order: Number(row.sort_order ?? 100),
        created_at: row.employee_created_at as string,
        updated_at: row.employee_updated_at as string,
        profile_id: (row.profile_id as string | null) ?? null,
        login_email: (row.login_email as string | null) ?? null,
        login_linked: Boolean(row.login_linked),
        login_active: Boolean(row.login_active),
        approval_status: (row.approval_status as string | null) ?? null,
        role: (row.role as string | null) ?? null,
        permissions: (row.permissions as Record<string, boolean>) ?? {},
        last_sign_in_at: (row.last_sign_in_at as string | null) ?? null,
        customer_count: Number(row.customer_count ?? 0),
        quote_count: Number(row.quote_count ?? 0),
        schedule_count: Number(row.schedule_count ?? 0),
        merged_into_employee_id: (mergeState?.merged_into_employee_id as string | null) ?? null,
        merged_at: (mergeState?.merged_at as string | null) ?? null,
        merged_by: (mergeState?.merged_by as string | null) ?? null,
      });
      })
    : fallbackEmployees;

  return {
    employees: masterEmployees,
    teams: (teamRes.data ?? []) as Team[],
    currentEmployeeId: access.profile?.employee_id ?? null,
    canManageAll,
    canMergeEmployees,
    canManageLoginAccounts,
    canAssignAdminRole,
    canAccessErp: true,
    isAuthenticated: true,
    loadError: masterRes.error
      ? isMissingEmployeeMasterMigrationError(masterRes.error)
        ? "Employee Master Migration(20260804000001)의 list_employee_master RPC가 확인되지 않았습니다."
        : "통합 로그인·담당 건수 조회에 실패해 기본 직원 목록을 표시합니다. 잠시 후 다시 시도해 주세요."
      : mergeStateRes.error
        ? isMissingEmployeeMasterMigrationError(mergeStateRes.error)
          ? "Employee Merge Migration(20260805000001)의 list_employee_merge_states RPC가 확인되지 않았습니다. 직원 목록은 계속 사용할 수 있습니다."
          : "병합 상태 조회에 실패했지만 직원 Master 목록은 정상 표시됩니다."
        : null,
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
  /** null이면 기존 show_business_card_on_quote 유지 */
  showBusinessCardOnQuote?: boolean | null;
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
    p_show_business_card_on_quote:
      input.showBusinessCardOnQuote === undefined
        ? null
        : input.showBusinessCardOnQuote,
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
