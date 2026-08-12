import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  createSignedEmployeeCardUrl,
  updateEmployeeContactProfile,
  uploadEmployeeBusinessCard,
} from "@/lib/crm/employee-contacts";
import { EMPLOYEE_BUSINESS_CARDS_BUCKET } from "@/lib/crm/quote-constants";

export type MyProfileData = {
  employeeId: string;
  companyId: string;
  name: string;
  title: string;
  teamName: string;
  phone: string;
  email: string;
  loginEmail: string;
  companyRole: string;
  companyRoleLabel: string;
  businessCardPath: string | null;
  businessCardUrl: string | null;
  showBusinessCardOnQuote: boolean;
};

const COMPANY_ROLE_LABEL: Record<string, string> = {
  owner: "대표",
  director: "이사",
  admin: "관리자",
  manager: "매니저",
  employee: "직원",
};

function teamNameOf(value: unknown): string {
  if (!value) return "미지정";
  if (Array.isArray(value)) {
    const first = value[0] as { name?: unknown } | undefined;
    return typeof first?.name === "string" && first.name.trim()
      ? first.name.trim()
      : "미지정";
  }
  if (typeof value === "object" && value !== null) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? name.trim() : "미지정";
  }
  return "미지정";
}

function normalizePhone(value: string): string {
  return value.replace(/[^0-9+\-() ]/g, "").trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function assertContactInput(phone: string, email: string) {
  if (phone.length > 40) {
    throw new Error("연락처는 40자 이내로 입력해 주세요.");
  }
  if (email.length > 254) {
    throw new Error("업무 이메일이 너무 깁니다.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("업무 이메일 형식을 확인해 주세요.");
  }
}

export async function getMyProfileData(): Promise<MyProfileData> {
  const access = await requireAuthenticatedAccess();
  const employeeId = access.profile?.employee_id ?? null;
  const companyId = access.profile?.active_company_id ?? null;

  if (!employeeId || !companyId) {
    throw new Error("현재 로그인 계정에 연결된 직원 정보가 없습니다.");
  }

  const supabase = await createClient();
  const [employeeResult, companyRoleResult, authResult] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, company_id, name, title, phone, email, business_card_path, show_business_card_on_quote, is_active, merged_into_employee_id, teams ( name )",
      )
      .eq("id", employeeId)
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase.rpc("current_company_role"),
    supabase.auth.getUser(),
  ]);

  if (employeeResult.error) {
    throw new Error("내 직원 정보를 불러오지 못했습니다.");
  }

  const employee = employeeResult.data as
    | {
        id: string;
        company_id: string;
        name: string;
        title: string;
        phone: string | null;
        email: string | null;
        business_card_path: string | null;
        show_business_card_on_quote: boolean | null;
        is_active: boolean;
        merged_into_employee_id: string | null;
        teams: unknown;
      }
    | null;

  if (!employee || !employee.is_active || employee.merged_into_employee_id) {
    throw new Error("활성 상태의 내 Employee Master를 찾을 수 없습니다.");
  }

  const companyRole =
    !companyRoleResult.error && typeof companyRoleResult.data === "string"
      ? companyRoleResult.data
      : "employee";
  const loginEmail =
    authResult.data.user?.email?.trim() || access.profile?.email?.trim() || "";

  let businessCardUrl: string | null = null;
  if (employee.business_card_path) {
    businessCardUrl = await createSignedEmployeeCardUrl(
      employee.business_card_path,
      60 * 30,
    ).catch(() => null);
  }

  return {
    employeeId: employee.id,
    companyId: employee.company_id,
    name: employee.name?.trim() || "직원",
    title: employee.title?.trim() || "직원",
    teamName: teamNameOf(employee.teams),
    phone: employee.phone?.trim() || "",
    email: employee.email?.trim() || "",
    loginEmail,
    companyRole,
    companyRoleLabel: COMPANY_ROLE_LABEL[companyRole] ?? "직원",
    businessCardPath: employee.business_card_path,
    businessCardUrl,
    showBusinessCardOnQuote: Boolean(employee.show_business_card_on_quote),
  };
}

export async function saveMyProfile(input: {
  phone: string;
  email: string;
  businessCardFile: File | null;
  clearBusinessCard: boolean;
  showBusinessCardOnQuote: boolean;
}): Promise<void> {
  const access = await requireAuthenticatedAccess();
  const employeeId = access.profile?.employee_id ?? null;
  const companyId = access.profile?.active_company_id ?? null;

  if (!employeeId || !companyId) {
    throw new Error("현재 로그인 계정에 연결된 직원 정보가 없습니다.");
  }

  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  assertContactInput(phone, email);

  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from("employees")
    .select(
      "id, company_id, title, business_card_path, is_active, merged_into_employee_id",
    )
    .eq("id", employeeId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !current) {
    throw new Error("내 직원 정보를 확인하지 못했습니다.");
  }
  if (!current.is_active || current.merged_into_employee_id) {
    throw new Error("활성 상태의 내 Employee Master만 수정할 수 있습니다.");
  }

  // 직책은 회사 관리 정보입니다. 클라이언트 입력을 받지 않고 DB의 현재 값을
  // 그대로 전달해 본인 수정 화면에서 직책이 변경되지 않도록 고정합니다.
  const currentTitle = String(current.title ?? "").trim();
  if (!currentTitle) {
    throw new Error("직책 정보가 없어 저장할 수 없습니다. 관리자에게 문의해 주세요.");
  }

  let nextCardPath: string | null | undefined;
  if (input.businessCardFile && input.businessCardFile.size > 0) {
    nextCardPath = await uploadEmployeeBusinessCard({
      employeeId,
      companyId,
      file: input.businessCardFile,
    });
  }

  await updateEmployeeContactProfile({
    employeeId,
    title: currentTitle,
    // 빈 문자열을 그대로 전달해야 직원이 기존 연락처/업무 이메일을 지울 수 있습니다.
    phone,
    email,
    businessCardPath: nextCardPath,
    clearBusinessCard: input.clearBusinessCard,
    showBusinessCardOnQuote:
      input.clearBusinessCard && !nextCardPath
        ? false
        : input.showBusinessCardOnQuote,
  });

  const previousCardPath = current.business_card_path as string | null;
  const replacedCard = Boolean(
    previousCardPath && nextCardPath && previousCardPath !== nextCardPath,
  );
  const clearedCard = Boolean(previousCardPath && input.clearBusinessCard);

  if ((replacedCard || clearedCard) && previousCardPath) {
    // DB 저장은 이미 성공했으므로 이전 파일 정리 실패가 사용자 저장을 되돌리지는 않습니다.
    await supabase.storage
      .from(EMPLOYEE_BUSINESS_CARDS_BUCKET)
      .remove([previousCardPath])
      .catch(() => undefined);
  }
}
