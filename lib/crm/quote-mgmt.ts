import { randomUUID } from "crypto";
import { cache } from "react";
import { createClient } from "@/lib/supabase-server";
import { requireAuthenticatedAccess } from "@/lib/crm/access";
import {
  getScheduleAccess,
  listEmployeesInScope,
} from "@/lib/crm/schedule-access";
import {
  ERP_QUOTE_STATUSES,
  ERP_QUOTE_TYPES,
  QUOTE_FILE_EXTENSIONS,
  QUOTE_FILE_MAX_BYTES,
  QUOTE_FILES_BUCKET,
  QUOTE_MODES,
  buildQuoteGuideMessage,
  canCostTypeHaveLx,
  computeQuoteAmounts,
  normalizeQuoteCostType,
  type QuoteCostType,
  type QuoteMode,
} from "@/lib/crm/quote-constants";
import type {
  ErpQuote,
  ErpQuoteFile,
  ErpQuoteSendLog,
  ErpQuoteStatus,
  ErpQuoteType,
} from "@/types/database";

function emptyToNull(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function parseMoney(value: FormDataEntryValue | null, label: string): number {
  const raw = String(value ?? "0").replace(/,/g, "").trim();
  const num = Number(raw || 0);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    throw new Error(`${label}은(는) 0 이상 정수(원)여야 합니다.`);
  }
  return num;
}

function assertQuoteFile(file: File) {
  if (file.size <= 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  if (file.size > QUOTE_FILE_MAX_BYTES) {
    throw new Error("파일은 30MB 이하여야 합니다.");
  }
  const ext = fileExt(file.name);
  if (!(QUOTE_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error("허용 파일: pdf, xls, xlsx");
  }
}

function fileExt(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

function mimeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

export type QuoteFormInput = {
  customer_id: string;
  project_id: string | null;
  quote_type: ErpQuoteType;
  quote_mode: QuoteMode;
  title: string;
  quote_number: string | null;
  status: ErpQuoteStatus;
  /** 항목이 없을 때 사용하는 총액 후보 (서버에서 재계산) */
  total_amount: number;
  discount_amount: number;
  lx_discount_rate: number;
  final_amount: number;
  valid_until: string | null;
  issued_at: string | null;
  assigned_employee_id: string | null;
  is_contract_quote: boolean;
  customer_message: string | null;
  memo: string | null;
};

export type QuoteItemInput = {
  /** 기존 DB 항목 ID. 없으면 신규 INSERT */
  id: string | null;
  /** 신규 행 클라이언트 키 (RPC id_map 매칭용) */
  client_key: string | null;
  trade_name: string;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number;
  amount: number;
  cost_type: QuoteCostType;
  is_lx_material: boolean;
  lx_discount_base_amount: number;
  /** null = 기존 견적 단위 할인율 적용 */
  lx_discount_type: string | null;
  lx_discount_value: number | null;
};

function parseLxDiscountRate(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "0").replace(/%/g, "").replace(/,/g, "").trim();
  const num = Number(raw || 0);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new Error("LX 자재 할인율은 0~100 사이여야 합니다.");
  }
  return Math.round(num * 100) / 100;
}

export function parseQuoteForm(formData: FormData): QuoteFormInput {
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const quoteType = String(formData.get("quote_type") ?? "").trim() as ErpQuoteType;
  const quoteModeRaw = String(formData.get("quote_mode") ?? "simple").trim();
  const quoteMode = (
    (QUOTE_MODES as readonly string[]).includes(quoteModeRaw)
      ? quoteModeRaw
      : "simple"
  ) as QuoteMode;
  const title = String(formData.get("title") ?? "").trim();
  const status = (String(formData.get("status") ?? "작성중").trim() ||
    "작성중") as ErpQuoteStatus;

  if (!customerId) throw new Error("고객을 선택해 주세요.");
  if (!(ERP_QUOTE_TYPES as readonly string[]).includes(quoteType)) {
    throw new Error("견적유형이 올바르지 않습니다.");
  }
  if (!title) throw new Error("견적명을 입력해 주세요.");
  if (!(ERP_QUOTE_STATUSES as readonly string[]).includes(status)) {
    throw new Error("견적 상태가 올바르지 않습니다.");
  }

  const total = parseMoney(formData.get("total_amount"), "총견적금액");
  const discount = parseMoney(formData.get("discount_amount"), "일반 할인금액");
  const lxDiscountRate = parseLxDiscountRate(formData.get("lx_discount_rate"));

  return {
    customer_id: customerId,
    project_id: emptyToNull(String(formData.get("project_id") ?? "")),
    quote_type: quoteType,
    quote_mode: quoteMode,
    title,
    quote_number: emptyToNull(String(formData.get("quote_number") ?? "")),
    status,
    total_amount: total,
    discount_amount: discount,
    lx_discount_rate: lxDiscountRate,
    final_amount: 0,
    valid_until: emptyToNull(String(formData.get("valid_until") ?? "")),
    issued_at: emptyToNull(String(formData.get("issued_at") ?? "")),
    assigned_employee_id: emptyToNull(
      String(formData.get("assigned_employee_id") ?? ""),
    ),
    is_contract_quote: ["on", "true", "1"].includes(
      String(formData.get("is_contract_quote") ?? "").toLowerCase(),
    ),
    customer_message: emptyToNull(
      String(formData.get("customer_message") ?? ""),
    ),
    memo: emptyToNull(String(formData.get("memo") ?? "")),
  };
}

export function parseQuoteItemsJson(raw: string): QuoteItemInput[] {
  if (!raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("견적 항목 형식이 올바르지 않습니다.");
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => {
      const r = row as Record<string, unknown>;
      const itemName = String(r.item_name ?? "").trim();
      const tradeRaw = String(r.trade_name ?? "").trim();
      if (!tradeRaw && !itemName) return null;

      const cost_type = normalizeQuoteCostType(
        r.cost_type == null ? null : String(r.cost_type),
      );

      const unitPrice = Math.max(0, Math.round(Number(r.unit_price ?? 0) || 0));
      const qtyRaw = r.quantity;
      const quantity =
        qtyRaw === null || qtyRaw === undefined || qtyRaw === ""
          ? null
          : Number(qtyRaw);
      let amount = Math.max(0, Math.round(Number(r.amount ?? 0) || 0));
      if (
        quantity != null &&
        Number.isFinite(quantity) &&
        quantity > 0 &&
        unitPrice > 0
      ) {
        amount = Math.round(quantity * unitPrice);
      }

      const wantsLx = ["on", "true", "1", true].includes(
        r.is_lx_material as string | boolean,
      );
      const is_lx_material = canCostTypeHaveLx(cost_type) && wantsLx;

      let lx_discount_base_amount = Math.max(
        0,
        Math.round(Number(r.lx_discount_base_amount ?? 0) || 0),
      );
      if (!is_lx_material) {
        lx_discount_base_amount = 0;
      } else if (cost_type === "자재") {
        // 자재는 항목 전체가 대상 — 저장값은 0이어도 계산 시 amount 사용
        lx_discount_base_amount = 0;
      } else if (cost_type === "시공+자재") {
        if (lx_discount_base_amount <= 0) {
          throw new Error(
            "자재+시공 항목의 LX 할인 대상 자재금액을 입력해주세요.",
          );
        }
        if (lx_discount_base_amount > amount) {
          throw new Error(
            "LX 자재금액은 항목 총금액 이하로 입력해주세요.",
          );
        }
      }

      const typeRaw = String(r.lx_discount_type ?? "").trim();
      let lx_discount_type: string | null = null;
      if (typeRaw === "none" || typeRaw === "rate" || typeRaw === "fixed") {
        lx_discount_type = typeRaw;
      }
      if (!is_lx_material) {
        lx_discount_type = lx_discount_type ? "none" : null;
      }

      let lx_discount_value: number | null = null;
      if (lx_discount_type === "rate" || lx_discount_type === "fixed") {
        const valueRaw = Number(r.lx_discount_value ?? 0);
        if (!Number.isFinite(valueRaw) || valueRaw < 0) {
          throw new Error("LX 할인값이 올바르지 않습니다.");
        }
        if (lx_discount_type === "rate") {
          if (valueRaw > 100) {
            throw new Error("LX 할인율은 0~100 사이여야 합니다.");
          }
          lx_discount_value = Math.round(valueRaw * 100) / 100;
        } else {
          lx_discount_value = Math.round(valueRaw);
          const base =
            cost_type === "자재"
              ? amount
              : Math.min(lx_discount_base_amount || amount, amount);
          if (lx_discount_value > base) {
            throw new Error("정액 할인은 항목 할인 대상 금액을 초과할 수 없습니다.");
          }
        }
      } else if (lx_discount_type === "none") {
        lx_discount_value = 0;
      }

      return {
        // 공종 미선택 허용(기존 호환). 빈 값은 빈 문자열로 저장 후 화면에서 미분류 표시
        id: (() => {
          const raw = String(r.id ?? "").trim();
          if (
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              raw,
            )
          ) {
            return raw;
          }
          return null;
        })(),
        client_key: emptyToNull(String(r.client_key ?? "")) ?? null,
        trade_name: tradeRaw,
        item_name: emptyToNull(itemName),
        description: emptyToNull(String(r.description ?? "")),
        quantity:
          quantity != null && Number.isFinite(quantity) ? quantity : null,
        unit: emptyToNull(String(r.unit ?? "")),
        unit_price: unitPrice,
        amount,
        cost_type,
        is_lx_material,
        lx_discount_base_amount,
        lx_discount_type,
        lx_discount_value,
      } satisfies QuoteItemInput;
    })
    .filter((x): x is QuoteItemInput => x != null);
}

function resolveQuoteAmounts(
  form: QuoteFormInput,
  items: QuoteItemInput[],
) {
  if (form.quote_mode === "simple" && items.length === 0) {
    throw new Error("간편견적은 항목을 1개 이상 추가해 주세요.");
  }
  if (
    form.quote_mode === "detailed" &&
    form.quote_type === "인테리어" &&
    items.length === 0
  ) {
    throw new Error("인테리어 상세견적은 공종 내역을 1개 이상 추가해 주세요.");
  }

  const amounts = computeQuoteAmounts({
    items,
    fallbackTotal: form.total_amount,
    discountAmount: form.discount_amount,
    lxDiscountRate: form.lx_discount_rate,
  });

  if (amounts.discount_amount + amounts.lx_discount_amount > amounts.total_amount) {
    // 최종금액은 0으로 클램프되며, 일반할인만 총액 초과는 막음
    if (amounts.discount_amount > amounts.total_amount) {
      throw new Error("일반 할인금액이 총견적금액을 초과할 수 없습니다.");
    }
  }

  return amounts;
}

const SELECT_FULL =
  "*, customers ( id, name, phone, address, assigned_employee_id, status ), employees ( id, name, title, team_id ), quote_files (*), quote_items (*)";

/** quote_files / quote_items 미적용 환경용 — 목록·고객상세는 동작 유지 */
const SELECT_BASIC =
  "*, customers ( id, name, phone, address, assigned_employee_id, status ), employees ( id, name, title, team_id )";

function sortNested(q: ErpQuote): ErpQuote {
  q.quote_files = [...(q.quote_files ?? [])]
    .filter((f) => !f.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  q.quote_items = [...(q.quote_items ?? [])]
    .filter((i) => !i.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  return q;
}

export type QuoteListFilters = {
  q?: string;
  quoteType?: string;
  status?: string;
  employeeId?: string;
  lxOnly?: boolean;
  contractOnly?: boolean;
  createdFrom?: string;
  createdTo?: string;
  customerId?: string;
};

function quoteInScope(
  row: ErpQuote,
  access: Awaited<ReturnType<typeof getScheduleAccess>>,
  scopedEmployeeIds: Set<string>,
): boolean {
  if (access.canViewAll) return true;
  if (row.created_by && row.created_by === access.userId) return true;
  if (
    row.assigned_employee_id &&
    scopedEmployeeIds.has(row.assigned_employee_id)
  ) {
    return true;
  }
  if (
    row.customers?.assigned_employee_id &&
    scopedEmployeeIds.has(row.customers.assigned_employee_id)
  ) {
    return true;
  }
  return false;
}

export async function listQuotes(
  filters: QuoteListFilters = {},
): Promise<ErpQuote[]> {
  const access = await getScheduleAccess();
  const scopedEmployees = await listEmployeesInScope(access);
  const scopedIds = new Set(scopedEmployees.map((e) => e.id));

  const supabase = await createClient();

  function buildQuery(selectClause: string) {
    let query = supabase
      .from("quotes")
      .select(selectClause)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (filters.customerId) query = query.eq("customer_id", filters.customerId);
    if (filters.quoteType) query = query.eq("quote_type", filters.quoteType);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.employeeId) {
      if (!access.canViewAll && !scopedIds.has(filters.employeeId)) {
        return null;
      }
      query = query.eq("assigned_employee_id", filters.employeeId);
    }
    if (filters.lxOnly) query = query.eq("is_lx_material", true);
    if (filters.contractOnly) query = query.eq("is_contract_quote", true);
    if (filters.createdFrom) {
      query = query.gte("created_at", `${filters.createdFrom}T00:00:00`);
    }
    if (filters.createdTo) {
      query = query.lte("created_at", `${filters.createdTo}T23:59:59`);
    }
    return query;
  }

  const fullQuery = buildQuery(SELECT_FULL);
  if (!fullQuery) return [];

  let { data, error } = await fullQuery;

  // 하위 테이블(embed)만 없을 때는 기본 컬럼으로 재시도
  if (
    error &&
    /quote_files|quote_items|Could not find the relationship|PGRST200/i.test(
      error.message,
    )
  ) {
    const basicQuery = buildQuery(SELECT_BASIC);
    if (!basicQuery) return [];
    ({ data, error } = await basicQuery);
  }

  if (error) {
    // 원문 메시지 유지 → 호출측에서 missing relation / permission 구분
    throw new Error(error.message || "견적 목록을 불러오지 못했습니다.");
  }

  let rows = ((data ?? []) as unknown as ErpQuote[])
    .map(sortNested)
    .filter((row) => quoteInScope(row, access, scopedIds));

  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) =>
      [
        row.customers?.name,
        row.customers?.phone,
        row.customers?.address,
        row.quote_number,
        row.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  return rows;
}

export async function getQuoteById(id: string): Promise<ErpQuote | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(SELECT_FULL)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("견적을 불러오지 못했습니다.");
  return data ? sortNested(data as ErpQuote) : null;
}

export async function listQuoteVersions(
  quoteGroupId: string,
): Promise<ErpQuote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(SELECT_FULL)
    .eq("quote_group_id", quoteGroupId)
    .is("deleted_at", null)
    .order("version_number", { ascending: true });
  if (error) throw new Error("버전 이력을 불러오지 못했습니다.");
  return ((data ?? []) as ErpQuote[]).map(sortNested);
}

export async function listQuoteSendLogs(
  quoteId: string,
): Promise<ErpQuoteSendLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_send_logs")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("발송 이력을 불러오지 못했습니다.");
  return (data ?? []) as ErpQuoteSendLog[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuidList(ids: string[]): string[] {
  return [
    ...new Set(
      ids
        .map((id) => id.trim())
        .filter((id) => UUID_RE.test(id)),
    ),
  ];
}

type QuoteRpcFailure = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

function logQuoteRpcFailure(
  rpcName: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
) {
  console.error("[quote-rpc]", {
    rpc: rpcName,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function quoteRpcUserMessage(failure: QuoteRpcFailure, fallback: string): string {
  const code = (failure.code || "").trim();
  const msg = (failure.message || "").trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes("update_quote_with_items") ||
    lower.includes("sync_quote_items")
  ) {
    if (
      lower.includes("schema cache") ||
      lower.includes("could not find") ||
      lower.includes("does not exist")
    ) {
      return "견적 안전 저장 기능이 아직 적용되지 않았습니다. migration 적용 후 다시 시도해 주세요.";
    }
  }

  if (msg.includes("누락")) {
    return "기존 견적 항목 정보가 누락되어 저장을 중단했습니다. 화면을 새로고침한 뒤 다시 시도해주세요.";
  }

  if (/[가-힣]/.test(msg) && msg.length < 180) {
    if (code && !msg.includes(code)) {
      return `${msg} (오류 ${code})`;
    }
    return msg;
  }

  if (code === "23514") {
    return `견적 항목을 저장하지 못했습니다. 입력값을 확인한 후 다시 시도해 주세요. (오류 ${code})`;
  }

  if (code) {
    return `${fallback} (오류 ${code})`;
  }

  return fallback;
}

function throwQuoteRpcError(
  rpcName: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
  fallback: string,
): never {
  logQuoteRpcFailure(rpcName, error);
  const failure: QuoteRpcFailure = {
    code: error.code,
    message: error.message || fallback,
    details: error.details,
    hint: error.hint,
  };
  const err = new Error(quoteRpcUserMessage(failure, fallback)) as Error &
    QuoteRpcFailure;
  err.code = failure.code;
  err.details = failure.details;
  err.hint = failure.hint;
  throw err;
}

function buildQuoteItemsRpcPayload(items: QuoteItemInput[]) {
  return items.map((item, index) => ({
    id: item.id ?? null,
    client_key: item.client_key ?? null,
    trade_name: item.trade_name || "미분류",
    item_name: item.item_name,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    amount: item.amount,
    cost_type: normalizeQuoteCostType(item.cost_type),
    is_lx_material:
      canCostTypeHaveLx(item.cost_type) && Boolean(item.is_lx_material),
    lx_discount_base_amount: item.lx_discount_base_amount,
    lx_discount_type: item.lx_discount_type,
    lx_discount_value: item.lx_discount_value,
    sort_order: index,
  }));
}

/**
 * 견적 항목 안전 동기화 (RPC sync_quote_items).
 * originalExistingItemIds: 편집 시작 시 활성 ID (추가 DB 조회 없이 사전 가드).
 * 신규 생성·버전 복사에서 사용. 수정 저장은 update_quote_with_items.
 */
async function syncQuoteItems(
  quoteId: string,
  items: QuoteItemInput[],
  removedItemIds: string[] = [],
  originalExistingItemIds: string[] = [],
) {
  const removed = normalizeUuidList(removedItemIds);
  const originalIds = normalizeUuidList(originalExistingItemIds);
  const incomingExistingIds = normalizeUuidList(
    items.map((item) => item.id ?? "").filter(Boolean),
  );

  // 앱 사전 가드: 추가 네트워크 요청 없음. 최종 안전은 RPC 집합 검증.
  if (originalIds.length > 0) {
    const covered = new Set([...incomingExistingIds, ...removed]);
    const missing = originalIds.filter((id) => !covered.has(id));
    if (missing.length > 0) {
      throw new Error(
        "기존 견적 항목 정보가 누락되어 저장을 중단했습니다. 화면을 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  }

  if (items.length === 0) {
    throw new Error("견적 항목은 1개 이상 필요합니다.");
  }

  const supabase = await createClient();
  const payload = buildQuoteItemsRpcPayload(items);

  const { data, error } = await supabase.rpc("sync_quote_items", {
    p_quote_id: quoteId,
    p_items: payload,
    p_removed_item_ids: removed,
  });

  if (error) {
    throwQuoteRpcError(
      "sync_quote_items",
      error,
      "견적 항목을 저장하지 못했습니다. 입력값을 확인한 후 다시 시도해 주세요.",
    );
  }

  return data;
}

/** @deprecated 이름 호환 — 내부는 syncQuoteItems */
async function replaceQuoteItems(
  quoteId: string,
  items: QuoteItemInput[],
  removedItemIds: string[] = [],
  originalExistingItemIds: string[] = [],
) {
  return syncQuoteItems(
    quoteId,
    items,
    removedItemIds,
    originalExistingItemIds,
  );
}

async function uploadQuoteFiles(input: {
  customerId: string;
  quoteId: string;
  files: File[];
  userId: string;
  setPrimaryFirst?: boolean;
}) {
  if (!input.files.length) return;
  const supabase = await createClient();
  let first = true;
  for (const file of input.files) {
    assertQuoteFile(file);
    const ext = fileExt(file.name);
    const path = `${input.customerId}/${input.quoteId}/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upError } = await supabase.storage
      .from(QUOTE_FILES_BUCKET)
      .upload(path, bytes, {
        contentType: file.type || mimeForExt(ext),
        upsert: false,
      });
    if (upError) throw new Error("파일 업로드에 실패했습니다.");

    const isPrimary = Boolean(input.setPrimaryFirst && first && ext === "pdf");
    first = false;

    const { error } = await supabase.from("quote_files").insert({
      quote_id: input.quoteId,
      file_type: ext,
      file_path: path,
      file_name: file.name,
      original_file_name: file.name,
      mime_type: file.type || mimeForExt(ext),
      file_size: file.size,
      is_primary: isPrimary,
      uploaded_by: input.userId,
    });
    if (error) throw new Error("파일 정보 저장에 실패했습니다.");
  }
}

export async function createQuote(input: {
  form: QuoteFormInput;
  items?: QuoteItemInput[];
  files?: File[];
}): Promise<ErpQuote> {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();

  const items = input.items ?? [];
  const amounts = resolveQuoteAmounts(input.form, items);

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      customer_id: input.form.customer_id,
      project_id: input.form.project_id,
      quote_type: input.form.quote_type,
      quote_mode: input.form.quote_mode,
      title: input.form.title,
      quote_number: input.form.quote_number,
      version_number: 1,
      status: input.form.status,
      total_amount: amounts.total_amount,
      discount_amount: amounts.discount_amount,
      lx_discount_rate: amounts.lx_discount_rate,
      lx_discount_amount: amounts.lx_discount_amount,
      final_amount: amounts.final_amount,
      valid_until: input.form.valid_until,
      issued_at: input.form.issued_at || new Date().toISOString().slice(0, 10),
      assigned_employee_id: input.form.assigned_employee_id,
      is_lx_material: amounts.is_lx_material,
      is_contract_quote: false,
      customer_message: input.form.customer_message,
      memo: input.form.memo,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("견적 등록에 실패했습니다.");

  await replaceQuoteItems(data.id, items);
  await uploadQuoteFiles({
    customerId: input.form.customer_id,
    quoteId: data.id,
    files: input.files ?? [],
    userId: access.userId!,
    setPrimaryFirst: true,
  });

  if (input.form.is_contract_quote) {
    await setContractQuote(data.id);
  }

  return (await getQuoteById(data.id))!;
}

export async function updateQuote(input: {
  id: string;
  form: QuoteFormInput;
  items?: QuoteItemInput[];
  removedItemIds?: string[];
  /** 편집 시작 시 활성 item ID (앱 사전 가드, 추가 조회 없음) */
  originalExistingItemIds?: string[];
  files?: File[];
}): Promise<ErpQuote> {
  const access = await requireAuthenticatedAccess();
  const existing = await getQuoteById(input.id);
  if (!existing) throw new Error("견적을 찾을 수 없습니다.");

  const items = input.items ?? [];
  const amounts = resolveQuoteAmounts(input.form, items);

  const removed = normalizeUuidList(input.removedItemIds ?? []);
  const originalIds = normalizeUuidList(
    input.originalExistingItemIds ??
      (existing.quote_items ?? [])
        .filter((i) => !i.deleted_at)
        .map((i) => i.id),
  );
  const incomingExistingIds = normalizeUuidList(
    items.map((item) => item.id ?? "").filter(Boolean),
  );

  if (originalIds.length > 0) {
    const covered = new Set([...incomingExistingIds, ...removed]);
    const missing = originalIds.filter((id) => !covered.has(id));
    if (missing.length > 0) {
      throw new Error(
        "기존 견적 항목 정보가 누락되어 저장을 중단했습니다. 화면을 새로고침한 뒤 다시 시도해주세요.",
      );
    }
  }

  if (items.length === 0) {
    throw new Error("견적 항목은 1개 이상 필요합니다.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_quote_with_items", {
    p_quote_id: input.id,
    p_header: {
      project_id: input.form.project_id,
      quote_type: input.form.quote_type,
      quote_mode: input.form.quote_mode,
      title: input.form.title,
      status: input.form.status,
      total_amount: amounts.total_amount,
      discount_amount: amounts.discount_amount,
      lx_discount_rate: amounts.lx_discount_rate,
      lx_discount_amount: amounts.lx_discount_amount,
      final_amount: amounts.final_amount,
      valid_until: input.form.valid_until,
      issued_at: input.form.issued_at,
      assigned_employee_id: input.form.assigned_employee_id,
      is_lx_material: amounts.is_lx_material,
      memo: input.form.memo,
      customer_message: input.form.customer_message,
    },
    p_items: buildQuoteItemsRpcPayload(items),
    p_removed_item_ids: removed,
  });

  if (error) {
    throwQuoteRpcError(
      "update_quote_with_items",
      error,
      "견적 항목을 저장하지 못했습니다. 입력값을 확인한 후 다시 시도해 주세요.",
    );
  }

  await uploadQuoteFiles({
    customerId: existing.customer_id,
    quoteId: input.id,
    files: input.files ?? [],
    userId: access.userId!,
    setPrimaryFirst: false,
  });

  return (await getQuoteById(input.id))!;
}

export async function createQuoteVersion(input: {
  sourceId: string;
  copyFiles: boolean;
  copyItems: boolean;
  titleSuffix?: string;
}): Promise<ErpQuote> {
  const access = await requireAuthenticatedAccess();
  const source = await getQuoteById(input.sourceId);
  if (!source) throw new Error("원본 견적을 찾을 수 없습니다.");

  const versions = await listQuoteVersions(source.quote_group_id);
  const nextVersion =
    Math.max(...versions.map((v) => v.version_number), 0) + 1;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      customer_id: source.customer_id,
      project_id: source.project_id,
      quote_group_id: source.quote_group_id,
      parent_quote_id: source.id,
      quote_type: source.quote_type,
      quote_mode: source.quote_mode || "simple",
      title: input.titleSuffix
        ? `${source.title} ${input.titleSuffix}`
        : source.title,
      quote_number: source.quote_number,
      version_number: nextVersion,
      status: "작성중",
      total_amount: source.total_amount,
      discount_amount: source.discount_amount,
      lx_discount_rate: source.lx_discount_rate ?? 0,
      lx_discount_amount: source.lx_discount_amount ?? 0,
      final_amount: source.final_amount,
      valid_until: source.valid_until,
      issued_at: new Date().toISOString().slice(0, 10),
      assigned_employee_id: source.assigned_employee_id,
      is_lx_material: source.is_lx_material,
      is_contract_quote: false,
      customer_message: source.customer_message,
      memo: source.memo,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("새 버전 생성에 실패했습니다.");

  if (input.copyItems && source.quote_items?.length) {
    await replaceQuoteItems(
      data.id,
      source.quote_items.map((i) => ({
        id: null,
        client_key: null,
        trade_name: i.trade_name,
        item_name: i.item_name,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        amount: i.amount,
        cost_type: normalizeQuoteCostType(i.cost_type),
        is_lx_material:
          canCostTypeHaveLx(i.cost_type) && Boolean(i.is_lx_material),
        lx_discount_base_amount: Math.max(
          0,
          Math.round(Number(i.lx_discount_base_amount ?? 0) || 0),
        ),
        lx_discount_type: i.lx_discount_type ?? null,
        lx_discount_value:
          i.lx_discount_value == null
            ? null
            : Number(i.lx_discount_value),
      })),
    );
  }

  if (input.copyFiles && source.quote_files?.length) {
    const supabase2 = await createClient();
    for (const file of source.quote_files) {
      const ext = fileExt(file.file_name);
      const newPath = `${source.customer_id}/${data.id}/${randomUUID()}.${ext}`;
      const { error: copyError } = await supabase2.storage
        .from(QUOTE_FILES_BUCKET)
        .copy(file.file_path, newPath);
      if (copyError) continue;
      await supabase2.from("quote_files").insert({
        quote_id: data.id,
        file_type: file.file_type,
        file_path: newPath,
        file_name: file.file_name,
        original_file_name: file.original_file_name,
        mime_type: file.mime_type,
        file_size: file.file_size,
        is_primary: file.is_primary,
        uploaded_by: access.userId,
      });
    }
  }

  return (await getQuoteById(data.id))!;
}

export async function softDeleteQuote(input: {
  id: string;
  deleteReason: string;
}) {
  const access = await requireAuthenticatedAccess();
  const reason = input.deleteReason.trim();
  if (!reason) throw new Error("삭제 사유를 입력해 주세요.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
      delete_reason: reason,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) throw new Error("견적 삭제에 실패했습니다.");
}

export async function softDeleteQuoteFile(input: {
  fileId: string;
  quoteId: string;
}) {
  const access = await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_files")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: access.userId,
    })
    .eq("id", input.fileId)
    .eq("quote_id", input.quoteId)
    .is("deleted_at", null);
  if (error) throw new Error("파일 삭제에 실패했습니다.");
}

export async function ensureQuoteShareToken(quoteId: string): Promise<string> {
  await requireAuthenticatedAccess();
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("quotes")
    .select("id, share_token")
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !existing) throw new Error("견적을 찾을 수 없습니다.");
  if (existing.share_token) return existing.share_token as string;

  const token = randomUUID();
  const { error } = await supabase
    .from("quotes")
    .update({ share_token: token })
    .eq("id", quoteId)
    .is("deleted_at", null);
  if (error) throw new Error("공유 링크 생성에 실패했습니다.");
  return token;
}

export type QuoteSharePayload = {
  id: string;
  title: string;
  quote_type: string;
  quote_mode?: string;
  quote_number: string | null;
  version_number: number;
  status: string;
  total_amount?: number;
  discount_amount?: number;
  lx_discount_rate?: number;
  lx_discount_amount?: number;
  final_amount: number;
  valid_until: string | null;
  issued_at: string | null;
  customer_message: string | null;
  is_lx_material: boolean;
  customer_name: string;
  company_name?: string | null;
  company_business_number?: string | null;
  brand_preset?: string | null;
  brand_slogan?: string | null;
  brand_intro?: string | null;
  brand_advantages?: unknown;
  brand_phone?: string | null;
  brand_trust_line?: string | null;
  brand_logo_path?: string | null;
  brand_cert_image_paths?: unknown;
  brand_site_image_paths?: unknown;
  items: {
    trade_name: string;
    item_name: string | null;
    description: string | null;
    quantity: number | null;
    unit: string | null;
    amount: number;
    cost_type?: string;
    is_lx_material?: boolean;
    lx_discount_base_amount?: number;
    lx_discount_type?: string | null;
    lx_discount_value?: number | null;
    sort_order: number;
  }[];
  files: {
    id: string;
    file_type: string;
    file_name: string;
    file_path: string;
    is_primary: boolean;
  }[];
};

/** 동일 요청 내 generateMetadata + page 중복 RPC 방지 */
export const getQuoteShareByToken = cache(
  async (token: string): Promise<QuoteSharePayload | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_quote_share_by_token", {
      p_token: token,
    });
    if (error) throw new Error("견적 공유 정보를 불러오지 못했습니다.");
    if (!data) return null;
    return data as QuoteSharePayload;
  },
);

export async function markQuoteSent(input: {
  id: string;
  note?: string | null;
  viewUrl?: string | null;
}): Promise<{ quote: ErpQuote; guideMessage: string; viewUrl: string }> {
  const access = await requireAuthenticatedAccess();
  const quote = await getQuoteById(input.id);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const token = await ensureQuoteShareToken(input.id);
  const viewUrl =
    input.viewUrl ||
    `${process.env.NEXT_PUBLIC_SITE_URL || ""}/customer/quotes/${token}`.replace(
      /([^:]\/)\/+/g,
      "$1",
    );

  const guideMessage = buildQuoteGuideMessage({
    customerName: quote.customers?.name || "고객",
    title: quote.title,
    validUntil: quote.valid_until,
    finalAmount: quote.final_amount,
    viewUrl,
    customerMessage: quote.customer_message,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({
      status: "발송완료",
      sent_at: new Date().toISOString(),
      sent_by: access.userId,
      updated_by: access.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) throw new Error("발송 처리에 실패했습니다.");

  await supabase.from("quote_send_logs").insert({
    quote_id: quote.id,
    customer_id: quote.customer_id,
    guide_message: guideMessage,
    note: emptyToNull(input.note),
    created_by: access.userId,
  });

  return {
    quote: (await getQuoteById(input.id))!,
    guideMessage,
    viewUrl,
  };
}

export async function setContractQuote(quoteId: string): Promise<ErpQuote> {
  const access = await requireAuthenticatedAccess();
  const quote = await getQuoteById(quoteId);
  if (!quote) throw new Error("견적을 찾을 수 없습니다.");

  const supabase = await createClient();
  await supabase
    .from("quotes")
    .update({
      is_contract_quote: false,
      updated_by: access.userId,
    })
    .eq("customer_id", quote.customer_id)
    .is("deleted_at", null)
    .neq("id", quoteId);

  const { error } = await supabase
    .from("quotes")
    .update({
      is_contract_quote: true,
      status: "계약전환",
      updated_by: access.userId,
    })
    .eq("id", quoteId)
    .is("deleted_at", null);

  if (error) throw new Error("계약 견적 지정에 실패했습니다.");
  return (await getQuoteById(quoteId))!;
}

export async function createSignedQuoteFileUrl(
  filePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(QUOTE_FILES_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error("파일 링크 생성에 실패했습니다.");
  }
  return data.signedUrl;
}

export async function createSignedUrlsForQuoteFiles(
  files: ErpQuoteFile[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    files.map(async (f) => {
      try {
        out[f.id] = await createSignedQuoteFileUrl(f.file_path);
      } catch {
        // ignore
      }
    }),
  );
  return out;
}

export function versionAmountDiff(
  current: ErpQuote,
  previous: ErpQuote | null,
): number | null {
  if (!previous) return null;
  return current.final_amount - previous.final_amount;
}

export function calcQuoteSummary(quotes: ErpQuote[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = quotes.filter(
    (q) => new Date(q.created_at) >= monthStart,
  );
  return {
    totalCount: quotes.length,
    drafting: quotes.filter((q) => q.status === "작성중").length,
    sent: quotes.filter((q) => q.status === "발송완료").length,
    contracted: quotes.filter((q) => q.status === "계약전환" || q.is_contract_quote)
      .length,
    monthAmount: thisMonth.reduce((s, q) => s + (q.final_amount || 0), 0),
    monthContractAmount: thisMonth
      .filter((q) => q.is_contract_quote || q.status === "계약전환")
      .reduce((s, q) => s + (q.final_amount || 0), 0),
  };
}

export function isQuoteExpired(quote: ErpQuote): boolean {
  if (!quote.valid_until) return false;
  if (["계약전환", "취소", "만료"].includes(quote.status)) {
    return quote.status === "만료";
  }
  const end = new Date(`${quote.valid_until}T23:59:59`);
  return end.getTime() < Date.now();
}

export function toQuoteSafeError(
  error: unknown,
  fallback = "처리 중 오류가 발생했습니다.",
): string {
  if (error instanceof Error) {
    const e = error as Error & QuoteRpcFailure;
    const msg = e.message || "";
    // throwQuoteRpcError 등에서 이미 안전한 한국어 메시지를 만든 경우 그대로 사용
    if (/[가-힣]/.test(msg) && msg.length < 220) {
      return msg;
    }
    return quoteRpcUserMessage(
      {
        code: typeof e.code === "string" ? e.code : undefined,
        message: msg || fallback,
        details: typeof e.details === "string" ? e.details : undefined,
        hint: typeof e.hint === "string" ? e.hint : undefined,
      },
      fallback,
    );
  }
  return fallback;
}
