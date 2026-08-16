"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  analyzeExpenseDocumentAction,
  approveExpenseRequestAction,
  approveVendorAction,
  markExpensePaidAction,
  rejectExpenseRequestAction,
  resolveAndApprovePostSettlementExpenseAction,
  type ExpenseActionResult,
  type PostSettlementApprovalInput,
} from "@/app/actions/expenses";
import {
  registerSimpleExpenseAction,
  type SimpleExpenseActionResult,
} from "@/app/actions/expense-simple";
import {
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_WORK_TRADE_LABELS,
  POST_SETTLEMENT_REASON_LABELS,
  POST_SETTLEMENT_TREATMENT_LABELS,
  SIMPLE_EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type ExpenseDocumentAnalysis,
  type ExpenseDocumentType,
  type ExpenseEmployeeOption,
  type ExpensePaymentMethod,
  type ExpenseProjectFinanceState,
  type ExpenseProjectOption,
  type ExpenseRequestRecord,
  type ExpenseWorkTrade,
  type PostSettlementReason,
  type PostSettlementTreatment,
  type SettlementAdjustmentRecord,
  type VendorRecord,
} from "@/lib/crm/expense-shared";

const initialState: SimpleExpenseActionResult = { success: false };
const SIMPLE_CATEGORIES = Object.keys(
  SIMPLE_EXPENSE_CATEGORY_LABELS,
) as Array<keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS>;
const PAYMENT_METHODS: ExpensePaymentMethod[] = [
  "company_card",
  "bank_transfer",
  "cash",
  "personal_card",
  "other",
];

function money(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function todayKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function projectFinanceState(
  project: ExpenseProjectOption | null | undefined,
): ExpenseProjectFinanceState | null {
  if (!project?.finance_state) return null;
  return Array.isArray(project.finance_state)
    ? project.finance_state[0] ?? null
    : project.finance_state;
}

function employeeLabel(employee: ExpenseEmployeeOption) {
  const team = Array.isArray(employee.teams)
    ? employee.teams[0]?.name
    : employee.teams?.name;
  return [employee.name, team, employee.title].filter(Boolean).join(" · ");
}

function isSimpleCategory(
  value: ExpenseCategory | null | undefined,
): value is keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS {
  return Boolean(value && SIMPLE_CATEGORIES.includes(value as keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS));
}

const fieldClass =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-500";
const labelClass = "mb-2 block text-sm font-bold text-slate-900";

export default function ExpenseWorkspaceV2({
  projects,
  vendors,
  requests,
  adjustmentEmployees,
  adjustments,
  isFinanceAdmin,
}: {
  projects: ExpenseProjectOption[];
  vendors: VendorRecord[];
  requests: ExpenseRequestRecord[];
  adjustmentEmployees: ExpenseEmployeeOption[];
  adjustments: SettlementAdjustmentRecord[];
  isFinanceAdmin: boolean;
}) {
  const router = useRouter();
  const [state, action, submitting] = useActionState(
    registerSimpleExpenseAction,
    initialState,
  );
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [workTrade, setWorkTrade] = useState<ExpenseWorkTrade | "">("");
  const [category, setCategory] = useState<
    keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS
  >("materials");
  const [vendorChoice, setVendorChoice] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<ExpensePaymentMethod>("company_card");
  const [expenseDate, setExpenseDate] = useState(todayKorea());
  const [totalAmount, setTotalAmount] = useState(0);
  const [supplyAmount, setSupplyAmount] = useState(0);
  const [vatAmount, setVatAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [documentType, setDocumentType] =
    useState<ExpenseDocumentType>("receipt");
  const [analysis, setAnalysis] = useState<ExpenseDocumentAnalysis | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [hasDocumentFile, setHasDocumentFile] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const selectedProject = projects.find((item) => item.id === projectId) ?? null;
  const isSelectedSettled =
    projectFinanceState(selectedProject)?.settlement_status === "settled";

  const pendingRequests = requests.filter((row) => row.status === "pending");
  const approvedRequests = requests.filter((row) => row.status === "approved");
  const pendingVendors = vendors.filter(
    (row) => row.review_status === "pending_review",
  );
  const activeAdjustments = adjustments.filter(
    (row) => row.status === "pending" || row.status === "partially_applied",
  );

  const totals = useMemo(
    () => ({
      pending: pendingRequests.reduce(
        (sum, row) => sum + Number(row.total_amount),
        0,
      ),
      approved: approvedRequests.reduce(
        (sum, row) => sum + Number(row.total_amount),
        0,
      ),
      paid: requests
        .filter((row) => row.status === "paid")
        .reduce((sum, row) => sum + Number(row.total_amount), 0),
      postPaid: requests
        .filter((row) => row.status === "paid" && row.is_post_settlement)
        .reduce((sum, row) => sum + Number(row.total_amount), 0),
    }),
    [requests, pendingRequests, approvedRequests],
  );

  useEffect(() => {
    if (!state.success || !state.expenseId) return;
    const timer = window.setTimeout(() => {
      setVendorChoice("");
      setNewVendorName("");
      setTotalAmount(0);
      setSupplyAmount(0);
      setVatAmount(0);
      setDescription("");
      setAnalysis(null);
      setAnalysisMessage(null);
      setHasDocumentFile(false);
      setShowAdvanced(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state.success, state.expenseId, router]);

  function applyVendorDefaults(vendor: VendorRecord | undefined) {
    if (!vendor) return;
    if (vendor.default_work_trade) setWorkTrade(vendor.default_work_trade);
    if (isSimpleCategory(vendor.default_expense_category)) {
      setCategory(vendor.default_expense_category);
    }
  }

  function chooseVendor(value: string) {
    setVendorChoice(value);
    if (value === "__new__") return;
    setNewVendorName("");
    applyVendorDefaults(vendors.find((vendor) => vendor.id === value));
  }

  function applyAnalysis(next: ExpenseDocumentAnalysis) {
    setAnalysis(next);
    setDocumentType(next.documentType);
    if (next.vendorName) {
      const found = vendors.find(
        (vendor) => normalize(vendor.name) === normalize(next.vendorName),
      );
      if (found) {
        setVendorChoice(found.id);
        setNewVendorName("");
        applyVendorDefaults(found);
      } else {
        setVendorChoice("__new__");
        setNewVendorName(next.vendorName);
      }
    }
    if (next.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(next.expenseDate)) {
      setExpenseDate(next.expenseDate);
    }
    if (next.totalAmount > 0) {
      setTotalAmount(next.totalAmount);
      setSupplyAmount(next.supplyAmount);
      setVatAmount(next.vatAmount);
    }
    if (next.paymentMethod) setPaymentMethod(next.paymentMethod);
    if (next.description) setDescription(next.description);
  }

  async function analyzeDocument() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setAnalysisBusy(true);
    setAnalysisMessage("증빙을 읽고 있습니다...");
    setAnalysis(null);
    try {
      const form = new FormData();
      form.set("document", file);
      const result = await analyzeExpenseDocumentAction(form);
      if (result.success && result.analysis) {
        applyAnalysis(result.analysis);
        setAnalysisMessage(
          result.analysis.warnings.length > 0
            ? `자동입력 완료 · ${result.analysis.warnings.join(" / ")}`
            : "자동입력 완료. 현장과 공종만 확인하고 등록하세요.",
        );
      } else {
        setAnalysisMessage(
          result.error ?? "자동인식에 실패했습니다. 금액만 직접 입력해도 됩니다.",
        );
      }
    } finally {
      setAnalysisBusy(false);
    }
  }

  function changeTotal(value: number) {
    const next = Math.max(0, Math.round(value || 0));
    setTotalAmount(next);
    if (!analysis || supplyAmount + vatAmount !== next) {
      setSupplyAmount(next);
      setVatAmount(0);
    }
  }

  function runAdminAction(fn: () => Promise<ExpenseActionResult>) {
    startTransition(async () => {
      const result = await fn();
      setLocalMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  const feedback = localMessage || state.message || state.error || analysisMessage;

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            state.error || feedback.includes("실패") || feedback.includes("중복")
              ? "border-red-200 bg-red-50 text-red-800"
              : analysisBusy
                ? "border-sky-200 bg-sky-50 text-sky-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">
              빠른 등록
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {isFinanceAdmin ? "지출결의서 작성" : "지출요청 등록"}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              현장 → 공종 → 거래처 → 금액 → 결제수단 → 내용만 확인하면 됩니다.
            </p>
          </div>
          <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
            영수증 없어도 등록 가능
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="m-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-8 text-center text-sm font-bold text-amber-900">
            등록할 현장이 없습니다. 계약/현장을 먼저 생성해 주세요.
          </div>
        ) : (
          <form action={action} className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={labelClass}>1. 현장 *</span>
                <select
                  name="project_id"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">현장을 선택하세요</option>
                  {projects.map((project) => {
                    const settled =
                      projectFinanceState(project)?.settlement_status === "settled";
                    return (
                      <option key={project.id} value={project.id}>
                        {settled ? "[정산완료] " : ""}
                        {project.customers?.name ?? "고객"} · {project.name}
                        {project.address ? ` · ${project.address}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label>
                <span className={labelClass}>2. 공종 *</span>
                <select
                  name="work_trade"
                  value={workTrade}
                  onChange={(e) => setWorkTrade(e.target.value as ExpenseWorkTrade)}
                  required
                  className={fieldClass}
                >
                  <option value="">공종을 선택하세요</option>
                  {Object.entries(EXPENSE_WORK_TRADE_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            {isSelectedSettled ? (
              <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                <p className="font-black">정산완료 현장입니다.</p>
                <p className="mt-1 font-medium">
                  평소처럼 등록하세요. ERP가 자동으로 사후지출로 분류하고 관리자가 처리방법을 결정합니다.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={labelClass}>3. 거래처</span>
                <select
                  name="vendor_id"
                  value={vendorChoice}
                  onChange={(e) => chooseVendor(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">거래처 선택 (없으면 건너뛰기)</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                      {vendor.review_status === "pending_review" ? " · 확인중" : ""}
                    </option>
                  ))}
                  <option value="__new__">+ 신규 거래처</option>
                </select>
              </label>

              <label>
                <span className={labelClass}>비용유형</span>
                <select
                  name="category"
                  value={category}
                  onChange={(e) =>
                    setCategory(
                      e.target.value as keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS,
                    )
                  }
                  className={fieldClass}
                >
                  {Object.entries(SIMPLE_EXPENSE_CATEGORY_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            {vendorChoice === "__new__" ? (
              <label className="block rounded-xl border border-violet-200 bg-violet-50 p-4">
                <span className="mb-2 block text-sm font-bold text-violet-950">
                  신규 거래처명
                </span>
                <input
                  name="new_vendor_name"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  placeholder="상호명만 입력하면 됩니다"
                  className={fieldClass}
                />
                <span className="mt-2 block text-xs font-medium text-violet-800">
                  우선 후보로 저장하고, 사업자번호·계좌정보는 관리자가 나중에 보완할 수 있습니다.
                </span>
              </label>
            ) : (
              <input type="hidden" name="new_vendor_name" value="" />
            )}

            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <label>
                <span className={labelClass}>4. 결제금액 *</span>
                <div className="relative">
                  <input
                    name="total_amount"
                    type="number"
                    min="1"
                    step="1"
                    value={totalAmount || ""}
                    onChange={(e) => changeTotal(Number(e.target.value) || 0)}
                    placeholder="0"
                    required
                    className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 pr-10 text-xl font-black text-slate-950 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-400"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600">
                    원
                  </span>
                </div>
              </label>

              <label>
                <span className={labelClass}>결제일 *</span>
                <input
                  name="expense_date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                  className={fieldClass}
                />
              </label>
            </div>

            <div>
              <span className={labelClass}>5. 결제수단 *</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PAYMENT_METHODS.map((method) => (
                  <label
                    key={method}
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-bold transition ${
                      paymentMethod === method
                        ? "border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-100"
                        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value={method}
                      checked={paymentMethod === method}
                      onChange={() => setPaymentMethod(method)}
                      className="sr-only"
                    />
                    {EXPENSE_PAYMENT_LABELS[method]}
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <label>
                  <span className="mb-2 block text-sm font-bold text-slate-900">
                    6. 영수증·거래명세서 <span className="font-medium text-slate-500">(선택)</span>
                  </span>
                  <input
                    ref={fileRef}
                    name="document"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    capture="environment"
                    onChange={() => {
                      setHasDocumentFile(Boolean(fileRef.current?.files?.[0]));
                      void analyzeDocument();
                    }}
                    className="block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void analyzeDocument()}
                  disabled={analysisBusy || !hasDocumentFile}
                  className="min-h-12 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {analysisBusy ? "읽는 중..." : "다시 읽기"}
                </button>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-700">
                첨부하면 거래처·금액·결제일을 자동으로 채웁니다. 영수증이 없어도 그대로 등록 가능합니다.
              </p>
            </div>

            <label>
              <span className={labelClass}>7. 지출내용 *</span>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="예: 거실 타일 자재 구입 / 목공 추가 인건비"
                rows={2}
                required
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-950 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-500"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className="text-left text-xs font-bold text-slate-600 hover:text-slate-950"
            >
              {showAdvanced ? "▾ 세부금액 닫기" : "▸ 공급가·부가세 직접 확인하기"}
            </button>

            {showAdvanced ? (
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                <label>
                  <span className={labelClass}>공급가</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={supplyAmount}
                    onChange={(e) => {
                      const supply = Number(e.target.value) || 0;
                      setSupplyAmount(supply);
                      setTotalAmount(supply + vatAmount);
                    }}
                    className={fieldClass}
                  />
                </label>
                <label>
                  <span className={labelClass}>부가세</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={vatAmount}
                    onChange={(e) => {
                      const vat = Number(e.target.value) || 0;
                      setVatAmount(vat);
                      setTotalAmount(supplyAmount + vat);
                    }}
                    className={fieldClass}
                  />
                </label>
                <label>
                  <span className={labelClass}>증빙종류</span>
                  <select
                    name="document_type"
                    value={documentType}
                    onChange={(e) =>
                      setDocumentType(e.target.value as ExpenseDocumentType)
                    }
                    className={fieldClass}
                  >
                    <option value="receipt">영수증</option>
                    <option value="transaction_statement">거래명세서</option>
                    <option value="invoice">세금계산서/청구서</option>
                    <option value="other">기타</option>
                  </select>
                </label>
              </div>
            ) : (
              <input type="hidden" name="document_type" value={documentType} />
            )}

            <input type="hidden" name="supply_amount" value={supplyAmount} />
            <input type="hidden" name="vat_amount" value={vatAmount} />
            <input
              type="hidden"
              name="ai_extracted"
              value={
                analysis
                  ? JSON.stringify({
                      document_type: analysis.documentType,
                      vendor_name: analysis.vendorName,
                      business_number: analysis.businessNumber,
                      phone: analysis.phone,
                      expense_date: analysis.expenseDate,
                      supply_amount: analysis.supplyAmount,
                      vat_amount: analysis.vatAmount,
                      total_amount: analysis.totalAmount,
                      payment_method: analysis.paymentMethod,
                      description: analysis.description,
                      warnings: analysis.warnings,
                    })
                  : "{}"
              }
            />
            <input type="hidden" name="ai_confidence" value={analysis?.confidence ?? 0} />
            <input type="hidden" name="memo" value="" />

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-600">
                {isFinanceAdmin
                  ? "관리자 등록 건은 바로 승인상태로 저장됩니다."
                  : "제출하면 관리자에게 확인 PUSH가 갑니다."}
              </p>
              <button
                type="submit"
                disabled={
                  submitting ||
                  analysisBusy ||
                  !projectId ||
                  !workTrade ||
                  totalAmount <= 0 ||
                  !description.trim() ||
                  (vendorChoice === "__new__" && !newVendorName.trim())
                }
                className="min-h-13 rounded-xl bg-slate-950 px-8 py-3 text-base font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting
                  ? "등록 중..."
                  : isFinanceAdmin
                    ? "지출결의 등록"
                    : "지출요청 제출"}
              </button>
            </div>
          </form>
        )}
      </section>

      {isFinanceAdmin ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="승인대기" value={money(totals.pending)} />
          <Summary label="승인·지급대기" value={money(totals.approved)} />
          <Summary label="지급완료" value={money(totals.paid)} />
          <Summary label="사후지출 지급" value={money(totals.postPaid)} tone="warn" />
        </section>
      ) : null}

      {isFinanceAdmin && pendingVendors.length > 0 ? (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
          <h2 className="text-base font-black text-violet-950">신규 거래처 확인</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingVendors.map((vendor) => (
              <div key={vendor.id} className="rounded-xl border border-violet-200 bg-white p-4">
                <p className="font-black text-slate-950">{vendor.name}</p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  {vendor.business_number || "사업자번호는 나중에 입력 가능"}
                </p>
                <button
                  disabled={pending}
                  onClick={() => runAdminAction(() => approveVendorAction(vendor.id))}
                  className="mt-3 min-h-10 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white"
                >
                  거래처 승인
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isFinanceAdmin ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-amber-950">지출 승인대기</h2>
              <p className="mt-1 text-sm font-medium text-amber-800">
                직원 요청만 확인하면 됩니다. 사후지출은 처리방법을 함께 지정합니다.
              </p>
            </div>
            <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-amber-950">
              {pendingRequests.length}건
            </span>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="mt-4 rounded-xl bg-white/80 px-4 py-6 text-center text-sm font-bold text-amber-900">
              승인대기 지출이 없습니다.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {pendingRequests.map((row) => (
                <div
                  key={row.id}
                  className={`rounded-xl border bg-white p-4 ${
                    row.is_post_settlement ? "border-orange-300" : "border-amber-200"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-950">
                          {row.projects?.name ?? "현장"} · {money(row.total_amount)}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                          {EXPENSE_WORK_TRADE_LABELS[row.work_trade] ?? "기타"}
                        </span>
                        {row.is_post_settlement ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                            사후지출
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {row.vendor_name_snapshot || "거래처 미지정"} · {row.description}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        {row.requested_employee
                          ? `${row.requested_employee.name} ${row.requested_employee.title}`
                          : "관리자"} 등록 · 증빙 {row.expense_documents?.length ?? 0}건
                      </p>
                    </div>
                    {!row.is_post_settlement ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={pending}
                          onClick={() =>
                            runAdminAction(() => approveExpenseRequestAction(row.id))
                          }
                          className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white"
                        >
                          승인
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => {
                            const reason = window.prompt("반려 사유를 입력해 주세요.");
                            if (reason?.trim()) {
                              runAdminAction(() =>
                                rejectExpenseRequestAction(row.id, reason),
                              );
                            }
                          }}
                          className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-red-700"
                        >
                          반려
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {row.is_post_settlement ? (
                    <PostSettlementApproval
                      row={row}
                      employees={adjustmentEmployees}
                      pending={pending}
                      onApprove={(input) =>
                        runAdminAction(() =>
                          resolveAndApprovePostSettlementExpenseAction(input),
                        )
                      }
                      onReject={() => {
                        const reason = window.prompt("반려 사유를 입력해 주세요.");
                        if (reason?.trim()) {
                          runAdminAction(() =>
                            rejectExpenseRequestAction(row.id, reason),
                          );
                        }
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isFinanceAdmin && approvedRequests.length > 0 ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <h2 className="text-lg font-black text-emerald-950">지급 대기</h2>
          <div className="mt-3 space-y-3">
            {approvedRequests.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-black text-slate-950">
                    {row.projects?.name ?? "현장"} · {row.vendor_name_snapshot ?? "거래처"} · {money(row.total_amount)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {EXPENSE_WORK_TRADE_LABELS[row.work_trade] ?? "기타"} · {row.description}
                  </p>
                </div>
                <button
                  disabled={pending}
                  onClick={() =>
                    runAdminAction(() =>
                      markExpensePaidAction(row.id, row.payment_method),
                    )
                  }
                  className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white"
                >
                  지급완료
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeAdjustments.length > 0 ? (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
          <h2 className="text-lg font-black text-indigo-950">
            {isFinanceAdmin ? "다음 정산 차감 대기" : "내 정산 조정 예정"}
          </h2>
          <div className="mt-3 space-y-2">
            {activeAdjustments.map((item) => (
              <div key={item.id} className="rounded-xl border border-indigo-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-black text-slate-950">
                    {item.employee
                      ? `${item.employee.name} ${item.employee.title}`
                      : "직원"} · 잔액 {money(item.remaining_amount)}
                  </p>
                  <p className="text-xs font-semibold text-slate-600">
                    원현장 {item.source_project?.name ?? "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">지출 이력</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            공종별로 기록되어 이후 현장 손익에서 바로 집계됩니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black text-slate-700">
              <tr>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">현장</th>
                <th className="px-4 py-3">공종</th>
                <th className="px-4 py-3">거래처 / 내용</th>
                <th className="px-4 py-3">결제</th>
                <th className="px-4 py-3 text-right">지급액</th>
                <th className="px-4 py-3 text-right">손익원가</th>
                <th className="px-4 py-3">증빙</th>
                <th className="px-4 py-3">신청자</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-800">
                  <td className="px-4 py-3">
                    <Status status={row.status} />
                    {row.is_post_settlement ? (
                      <span className="ml-1 inline-flex rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-800">
                        사후
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-950">
                    {row.projects?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {EXPENSE_WORK_TRADE_LABELS[row.work_trade] ?? "기타"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">
                      {row.vendor_name_snapshot ?? "-"}
                    </p>
                    <p className="max-w-xs truncate text-xs font-medium text-slate-600">
                      {row.description}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {EXPENSE_PAYMENT_LABELS[row.payment_method]}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-950">
                    {money(row.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-950">
                    {money(row.cost_basis_amount)}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {(row.expense_documents?.length ?? 0) > 0
                      ? `${row.expense_documents?.length ?? 0}건`
                      : "미첨부"}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {row.requested_employee
                      ? `${row.requested_employee.name} ${row.requested_employee.title}`
                      : "관리자"}
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center font-semibold text-slate-500">
                    등록된 지출이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PostSettlementApproval({
  row,
  employees,
  pending,
  onApprove,
  onReject,
}: {
  row: ExpenseRequestRecord;
  employees: ExpenseEmployeeOption[];
  pending: boolean;
  onApprove: (input: PostSettlementApprovalInput) => void;
  onReject: () => void;
}) {
  const [reason, setReason] = useState<PostSettlementReason>("late_vendor_invoice");
  const [treatment, setTreatment] =
    useState<PostSettlementTreatment>("company_absorb");
  const [employeeId, setEmployeeId] = useState(
    row.requested_by_employee_id ?? employees[0]?.id ?? "",
  );
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [recoveryAmount, setRecoveryAmount] = useState(0);
  const [note, setNote] = useState("");

  const canApprove =
    treatment === "next_settlement_deduction"
      ? Boolean(employeeId) &&
        adjustmentAmount > 0 &&
        adjustmentAmount <= row.total_amount
      : treatment === "vendor_recovery" || treatment === "customer_rebill"
        ? recoveryAmount > 0 && recoveryAmount <= row.total_amount
        : true;

  return (
    <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4">
      <p className="font-black text-orange-950">정산완료 후 추가비용 처리</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          <span className={labelClass}>발생 사유</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as PostSettlementReason)}
            className={fieldClass}
          >
            {Object.entries(POST_SETTLEMENT_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>처리 방법</span>
          <select
            value={treatment}
            onChange={(e) =>
              setTreatment(e.target.value as PostSettlementTreatment)
            }
            className={fieldClass}
          >
            {Object.entries(POST_SETTLEMENT_TREATMENT_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>

        {treatment === "next_settlement_deduction" ? (
          <>
            <label>
              <span className={labelClass}>차감 대상 직원</span>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={fieldClass}
              >
                <option value="">직원 선택</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employeeLabel(employee)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>다음 정산 차감액</span>
              <input
                type="number"
                min="1"
                max={row.total_amount}
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(Number(e.target.value) || 0)}
                className={fieldClass}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setAdjustmentAmount(Math.round(row.total_amount * 0.5))
                  }
                  className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-orange-800 ring-1 ring-orange-200"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentAmount(row.total_amount)}
                  className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-orange-800 ring-1 ring-orange-200"
                >
                  전액
                </button>
              </div>
            </label>
          </>
        ) : null}

        {treatment === "vendor_recovery" || treatment === "customer_rebill" ? (
          <label>
            <span className={labelClass}>회수/청구 예정액</span>
            <input
              type="number"
              min="1"
              max={row.total_amount}
              value={recoveryAmount}
              onChange={(e) => setRecoveryAmount(Number(e.target.value) || 0)}
              className={fieldClass}
            />
          </label>
        ) : null}

        <label className="sm:col-span-2 lg:col-span-3">
          <span className={labelClass}>관리 메모</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="필요한 경우만 입력"
            className={fieldClass}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !canApprove}
          onClick={() =>
            onApprove({
              expenseId: row.id,
              reason,
              treatment,
              adjustmentEmployeeId: employeeId || null,
              adjustmentAmount,
              recoveryExpectedAmount: recoveryAmount,
              note,
            })
          }
          className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-black text-white disabled:opacity-40"
        >
          저장 + 승인
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onReject}
          className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-red-700"
        >
          반려
        </button>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "warn"
          ? "border-orange-200 bg-orange-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Status({ status }: { status: ExpenseRequestRecord["status"] }) {
  const cls =
    status === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : status === "approved"
        ? "bg-sky-100 text-sky-800"
        : status === "pending"
          ? "bg-amber-100 text-amber-900"
          : status === "rejected"
            ? "bg-red-100 text-red-800"
            : "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${cls}`}>
      {EXPENSE_STATUS_LABELS[status]}
    </span>
  );
}
