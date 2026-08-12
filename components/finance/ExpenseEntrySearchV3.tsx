"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  registerSimpleExpenseAction,
  type SimpleExpenseActionResult,
} from "@/app/actions/expense-simple";
import { searchExpenseProjectsAction } from "@/app/actions/expense-project-search";
import { analyzeExpenseDocumentAction } from "@/app/actions/expenses";
import {
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_WORK_TRADE_LABELS,
  SIMPLE_EXPENSE_CATEGORY_LABELS,
  type ExpenseDocumentAnalysis,
  type ExpenseDocumentType,
  type ExpensePaymentMethod,
  type ExpenseProjectFinanceState,
  type ExpenseProjectOption,
  type ExpenseWorkTrade,
  type VendorRecord,
} from "@/lib/crm/expense-shared";

const initialState: SimpleExpenseActionResult = { success: false };

function todayKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function projectFinanceState(
  project: ExpenseProjectOption | null,
): ExpenseProjectFinanceState | null {
  if (!project?.finance_state) return null;
  return Array.isArray(project.finance_state)
    ? project.finance_state[0] ?? null
    : project.finance_state;
}

function projectLabel(project: ExpenseProjectOption) {
  const customer = project.customers?.name ?? "고객";
  return `${customer} · ${project.name}${project.address ? ` · ${project.address}` : ""}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function onlyMoney(value: string) {
  return Number(value.replace(/[^0-9]/g, "")) || 0;
}

const fieldClass =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-500";
const labelClass = "mb-2 block text-sm font-black text-slate-950";

export default function ExpenseEntrySearchV3({
  initialProjects,
  vendors,
  isFinanceAdmin,
}: {
  initialProjects: ExpenseProjectOption[];
  vendors: VendorRecord[];
  isFinanceAdmin: boolean;
}) {
  const [state, action, submitting] = useActionState(
    registerSimpleExpenseAction,
    initialState,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] =
    useState<ExpenseProjectOption[]>(initialProjects);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [selectedProject, setSelectedProject] =
    useState<ExpenseProjectOption | null>(null);
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

  useEffect(() => {
    if (selectedProject && projectQuery === projectLabel(selectedProject)) return;
    const timer = window.setTimeout(async () => {
      setProjectBusy(true);
      try {
        const rows = await searchExpenseProjectsAction(projectQuery);
        setProjectResults(rows);
      } catch {
        setProjectResults([]);
      } finally {
        setProjectBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [projectQuery, selectedProject]);

  useEffect(() => {
    if (!state.success || !state.expenseId) return;
    // 연속 입력이 많은 현장업무를 고려해 현장/공종/비용유형은 유지합니다.
    setVendorChoice("");
    setNewVendorName("");
    setTotalAmount(0);
    setSupplyAmount(0);
    setVatAmount(0);
    setDescription("");
    setAnalysis(null);
    setAnalysisMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [state.success, state.expenseId]);

  const isSelectedSettled =
    projectFinanceState(selectedProject)?.settlement_status === "settled";

  function selectProject(project: ExpenseProjectOption) {
    setSelectedProject(project);
    setProjectQuery(projectLabel(project));
    setProjectOpen(false);
  }

  function chooseVendor(value: string) {
    setVendorChoice(value);
    if (value === "__new__") return;
    setNewVendorName("");
    const vendor = vendors.find((item) => item.id === value);
    if (!vendor) return;
    if (vendor.default_work_trade) setWorkTrade(vendor.default_work_trade);
    if (
      vendor.default_expense_category &&
      vendor.default_expense_category in SIMPLE_EXPENSE_CATEGORY_LABELS
    ) {
      setCategory(
        vendor.default_expense_category as keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS,
      );
    }
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
        chooseVendor(found.id);
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
    setAnalysisMessage("영수증을 읽고 있습니다...");
    setAnalysis(null);
    try {
      const form = new FormData();
      form.set("document", file);
      const result = await analyzeExpenseDocumentAction(form);
      if (result.success && result.analysis) {
        applyAnalysis(result.analysis);
        setAnalysisMessage("자동입력 완료 · 현장과 공종만 확인하세요.");
      } else {
        setAnalysisMessage(
          result.error ?? "자동인식 실패 · 금액만 직접 입력해도 됩니다.",
        );
      }
    } finally {
      setAnalysisBusy(false);
    }
  }

  function changeTotal(text: string) {
    const next = onlyMoney(text);
    setTotalAmount(next);
    setSupplyAmount(next);
    setVatAmount(0);
  }

  const feedback = state.message || state.error || analysisMessage;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-sky-700">
            빠른 등록
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            {isFinanceAdmin ? "지출결의서 작성" : "지출요청 등록"}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            현장은 검색해서 선택하고, 나머지는 필요한 것만 빠르게 입력하세요.
          </p>
        </div>
        <span className="w-fit rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800">
          {isFinanceAdmin ? "전체 현장 검색" : "내 담당 고객 현장만 검색"}
        </span>
      </div>

      <form action={action} className="space-y-5 p-5">
        {feedback ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              state.error
                ? "border-red-200 bg-red-50 text-red-800"
                : analysisBusy
                  ? "border-sky-200 bg-sky-50 text-sky-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {feedback}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="relative">
            <label className={labelClass}>1. 현장 검색 *</label>
            <input
              value={projectQuery}
              onFocus={() => setProjectOpen(true)}
              onBlur={() => window.setTimeout(() => setProjectOpen(false), 150)}
              onChange={(event) => {
                setProjectQuery(event.target.value);
                setSelectedProject(null);
                setProjectOpen(true);
              }}
              placeholder="고객명 · 현장명 · 주소 검색"
              className={fieldClass}
              autoComplete="off"
            />
            <input
              type="hidden"
              name="project_id"
              value={selectedProject?.id ?? ""}
            />
            {projectOpen ? (
              <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                <div className="px-3 py-2 text-xs font-bold text-slate-500">
                  {projectBusy
                    ? "검색 중..."
                    : projectQuery.trim()
                      ? `${projectResults.length}개 검색됨`
                      : "최근 현장"}
                </div>
                {!projectBusy && projectResults.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                    {isFinanceAdmin
                      ? "검색되는 현장이 없습니다."
                      : "내 담당 고객 현장에서 검색되는 결과가 없습니다."}
                  </div>
                ) : null}
                {projectResults.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectProject(project)}
                    className="block w-full rounded-lg px-3 py-3 text-left hover:bg-sky-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-950">
                        {project.customers?.name ?? "고객"} · {project.name}
                      </span>
                      {projectFinanceState(project)?.settlement_status === "settled" ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-800">
                          정산완료
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      {project.address || "주소 미등록"}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
            {selectedProject ? (
              <p className="mt-2 text-xs font-bold text-emerald-700">
                ✓ {projectLabel(selectedProject)} 선택됨
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                검색 결과에서 현장을 반드시 선택해 주세요.
              </p>
            )}
          </div>

          <label>
            <span className={labelClass}>2. 공종 *</span>
            <select
              name="work_trade"
              value={workTrade}
              onChange={(event) =>
                setWorkTrade(event.target.value as ExpenseWorkTrade)
              }
              required
              className={fieldClass}
            >
              <option value="">공종을 선택하세요</option>
              {Object.entries(EXPENSE_WORK_TRADE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isSelectedSettled ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-950">
            <strong>정산완료 현장입니다.</strong> 평소처럼 등록하면 사후지출로 자동 분류됩니다.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <label>
            <span className={labelClass}>3. 거래처</span>
            <select
              name="vendor_id"
              value={vendorChoice}
              onChange={(event) => chooseVendor(event.target.value)}
              className={fieldClass}
            >
              <option value="">거래처 선택 (없으면 건너뛰기)</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
              <option value="__new__">+ 신규 거래처</option>
            </select>
          </label>

          {vendorChoice === "__new__" ? (
            <label>
              <span className={labelClass}>신규 거래처명 *</span>
              <input
                name="new_vendor_name"
                value={newVendorName}
                onChange={(event) => setNewVendorName(event.target.value)}
                placeholder="상호명만 입력"
                className={fieldClass}
              />
            </label>
          ) : (
            <div>
              <span className={labelClass}>비용유형</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {Object.entries(SIMPLE_EXPENSE_CATEGORY_LABELS).map(
                  ([value, label]) => (
                    <label
                      key={value}
                      className={`cursor-pointer rounded-xl border px-2 py-3 text-center text-xs font-black transition ${
                        category === value
                          ? "border-sky-600 bg-sky-50 text-sky-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={value}
                        checked={category === value}
                        onChange={() =>
                          setCategory(
                            value as keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS,
                          )
                        }
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        {vendorChoice === "__new__" ? (
          <div>
            <span className={labelClass}>비용유형</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Object.entries(SIMPLE_EXPENSE_CATEGORY_LABELS).map(
                ([value, label]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-xl border px-2 py-3 text-center text-xs font-black transition ${
                      category === value
                        ? "border-sky-600 bg-sky-50 text-sky-900"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={value}
                      checked={category === value}
                      onChange={() =>
                        setCategory(
                          value as keyof typeof SIMPLE_EXPENSE_CATEGORY_LABELS,
                        )
                      }
                      className="sr-only"
                    />
                    {label}
                  </label>
                ),
              )}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <label>
            <span className={labelClass}>4. 결제금액 *</span>
            <div className="relative">
              <input
                name="total_amount"
                value={totalAmount ? totalAmount.toLocaleString("ko-KR") : ""}
                onChange={(event) => changeTotal(event.target.value)}
                inputMode="numeric"
                placeholder="예: 350,000"
                required
                className={`${fieldClass} pr-10 text-lg font-black`}
              />
              <span className="absolute right-3 top-3.5 text-sm font-bold text-slate-600">
                원
              </span>
            </div>
            <input type="hidden" name="supply_amount" value={supplyAmount} />
            <input type="hidden" name="vat_amount" value={vatAmount} />
          </label>

          <label>
            <span className={labelClass}>5. 결제수단 *</span>
            <select
              name="payment_method"
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as ExpensePaymentMethod)
              }
              className={fieldClass}
            >
              {Object.entries(EXPENSE_PAYMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={labelClass}>결제일</span>
            <input
              name="expense_date"
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label>
            <span className={labelClass}>6. 영수증·거래명세서 <span className="text-slate-500">(선택)</span></span>
            <input
              ref={fileRef}
              name="document"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              onChange={() => void analyzeDocument()}
              className={`${fieldClass} py-2.5`}
            />
            <input type="hidden" name="document_type" value={documentType} />
            <input
              type="hidden"
              name="ai_extracted"
              value={analysis ? JSON.stringify(analysis) : "{}"}
            />
            <input
              type="hidden"
              name="ai_confidence"
              value={analysis?.confidence ?? 0}
            />
          </label>

          <label>
            <span className={labelClass}>7. 지출내용 *</span>
            <input
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="예: 주방 타일 자재 구입"
              required
              className={fieldClass}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">
            등록 후에도 현장·공종은 유지되어 같은 현장의 지출을 연속 입력하기 편합니다.
          </p>
          <button
            type="submit"
            disabled={
              submitting ||
              analysisBusy ||
              !selectedProject ||
              !workTrade ||
              totalAmount <= 0 ||
              !description.trim()
            }
            className="min-h-12 rounded-xl bg-navy-900 px-8 text-sm font-black text-white shadow-sm transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? "등록 중..."
              : isFinanceAdmin
                ? "지출결의 등록"
                : "지출요청 등록"}
          </button>
        </div>
      </form>
    </section>
  );
}
