"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeExpenseDocumentAction,
  approveExpenseRequestAction,
  approveVendorAction,
  markExpensePaidAction,
  registerExpenseRequestAction,
  rejectExpenseRequestAction,
  resolveAndApprovePostSettlementExpenseAction,
  type ExpenseActionResult,
  type PostSettlementApprovalInput,
} from "@/app/actions/expenses";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_DOCUMENT_LABELS,
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_STATUS_LABELS,
  POST_SETTLEMENT_REASON_LABELS,
  POST_SETTLEMENT_TREATMENT_LABELS,
  type ExpenseDocumentAnalysis,
  type ExpenseDocumentType,
  type ExpenseEmployeeOption,
  type ExpensePaymentMethod,
  type ExpenseProjectFinanceState,
  type ExpenseProjectOption,
  type ExpenseRequestRecord,
  type PostSettlementReason,
  type PostSettlementTreatment,
  type SettlementAdjustmentRecord,
  type VendorRecord,
} from "@/lib/crm/expense-shared";

const initialState: ExpenseActionResult = { success: false };

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

function normalizeVendor(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function projectFinanceState(project: ExpenseProjectOption | null | undefined): ExpenseProjectFinanceState | null {
  if (!project?.finance_state) return null;
  return Array.isArray(project.finance_state)
    ? project.finance_state[0] ?? null
    : project.finance_state;
}

function employeeLabel(employee: ExpenseEmployeeOption) {
  const team = Array.isArray(employee.teams) ? employee.teams[0]?.name : employee.teams?.name;
  return [employee.name, team, employee.title].filter(Boolean).join(" · ");
}

export default function ExpensesWorkspace({
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
  const [state, action, submitting] = useActionState(registerExpenseRequestAction, initialState);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ExpenseDocumentAnalysis | null>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [documentType, setDocumentType] = useState<ExpenseDocumentType>("receipt");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("bank_transfer");
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayKorea());
  const [supplyAmount, setSupplyAmount] = useState(0);
  const [vatAmount, setVatAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const selectedProject = projects.find((row) => row.id === projectId) ?? null;
  const selectedFinanceState = projectFinanceState(selectedProject);
  const isSelectedSettled = selectedFinanceState?.settlement_status === "settled";

  const pendingRequests = requests.filter((row) => row.status === "pending");
  const approvedRequests = requests.filter((row) => row.status === "approved");
  const pendingVendors = vendors.filter((row) => row.review_status === "pending_review");
  const activeAdjustments = adjustments.filter((row) => row.status === "pending" || row.status === "partially_applied");

  const totals = useMemo(() => ({
    pending: pendingRequests.reduce((sum, row) => sum + Number(row.total_amount), 0),
    approved: approvedRequests.reduce((sum, row) => sum + Number(row.total_amount), 0),
    paid: requests.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.total_amount), 0),
    postPaid: requests.filter((row) => row.status === "paid" && row.is_post_settlement).reduce((sum, row) => sum + Number(row.total_amount), 0),
  }), [requests, pendingRequests, approvedRequests]);

  const feedback = localMessage || state.message || state.error || analysisMessage;

  function applyAnalysis(next: ExpenseDocumentAnalysis) {
    setAnalysis(next);
    setDocumentType(next.documentType);
    if (next.vendorName) {
      setVendorName(next.vendorName);
      const norm = normalizeVendor(next.vendorName);
      const found = vendors.find((vendor) => vendor.normalized_name === norm || normalizeVendor(vendor.name) === norm);
      setVendorId(found?.id ?? "");
    }
    setBusinessNumber(next.businessNumber || "");
    setVendorPhone(next.phone || "");
    if (next.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(next.expenseDate)) setExpenseDate(next.expenseDate);
    setSupplyAmount(next.supplyAmount);
    setVatAmount(next.vatAmount);
    setTotalAmount(next.totalAmount);
    if (next.paymentMethod) setPaymentMethod(next.paymentMethod);
    if (next.description) setDescription(next.description);
  }

  async function analyzeDocument() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setAnalysisMessage("영수증 또는 거래명세서를 먼저 선택해 주세요.");
      return;
    }
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
            ? `자동인식 완료 · 확인필요: ${result.analysis.warnings.join(" / ")}`
            : "자동인식 완료. 거래처와 금액만 확인하고 제출하세요.",
        );
      } else {
        setAnalysisMessage(result.error ?? "자동인식에 실패했습니다. 직접 입력해 주세요.");
      }
    } finally {
      setAnalysisBusy(false);
    }
  }

  function runAdminAction(fn: () => Promise<ExpenseActionResult>) {
    startTransition(async () => {
      const result = await fn();
      setLocalMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          state.error || feedback.includes("실패") || feedback.includes("필수") || feedback.includes("중복")
            ? "border-red-200 bg-red-50 text-red-800"
            : analysisBusy
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}>
          {feedback}
        </div>
      ) : null}

      {isFinanceAdmin ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="승인대기" value={money(totals.pending)} />
          <Summary label="승인·지급대기" value={money(totals.approved)} />
          <Summary label="지급완료" value={money(totals.paid)} />
          <Summary label="사후지출 지급" value={money(totals.postPaid)} tone="warn" />
        </section>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-950">지출요청서 작성</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              현장을 선택하고 영수증·거래명세서를 촬영하거나 첨부하세요. 자동인식된 값에서 틀린 부분만 고치면 됩니다.
            </p>
          </div>
          <span className="w-fit rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">법인카드 영수증 필수</span>
        </div>

        {projects.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-8 text-center text-sm text-amber-900">
            지출을 연결할 현장이 없습니다. 먼저 계약/현장을 생성해 주세요.
          </div>
        ) : (
          <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="sm:col-span-2 xl:col-span-3">
              <span className="mb-1.5 block text-xs font-bold text-red-700">현장 선택 *</span>
              <select name="project_id" required value={projectId} onChange={(e) => setProjectId(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                <option value="">현장을 선택하세요</option>
                {projects.map((project) => {
                  const settled = projectFinanceState(project)?.settlement_status === "settled";
                  return (
                    <option key={project.id} value={project.id}>
                      {settled ? "[정산완료] " : ""}{project.customers?.name ?? "고객"} · {project.name}{project.address ? ` · ${project.address}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            {isSelectedSettled ? (
              <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                <p className="font-bold">정산완료 현장입니다. 이 지출은 자동으로 사후지출로 기록됩니다.</p>
                <p className="mt-1 text-xs leading-relaxed">직원은 평소처럼 제출하면 됩니다. 실제 현장손익에는 반영되고, 회사부담/다음 정산 차감/회수 여부는 관리자가 승인할 때 결정합니다.</p>
              </div>
            ) : null}

            <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-slate-700">증빙 종류</span>
                  <select name="document_type" value={documentType} onChange={(e) => setDocumentType(e.target.value as ExpenseDocumentType)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                    {Object.entries(EXPENSE_DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="sm:col-span-1 xl:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">영수증 / 거래명세서 첨부</span>
                  <input
                    ref={fileRef}
                    name="document"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    capture="environment"
                    onChange={() => void analyzeDocument()}
                    className="block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-end">
                  <button type="button" onClick={() => void analyzeDocument()} disabled={analysisBusy} className="min-h-11 w-full rounded-lg bg-sky-700 px-4 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">
                    {analysisBusy ? "자동인식 중..." : "다시 자동인식"}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-600">파일 선택 즉시 자동인식합니다. 같은 증빙 파일은 중복 등록을 차단하고 PDF 거래명세서도 지원합니다.</p>
            </div>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">거래처</span>
              <input list="vendor-list" name="vendor_name" value={vendorName} onChange={(e) => {
                const value = e.target.value;
                setVendorName(value);
                const norm = normalizeVendor(value);
                const found = vendors.find((vendor) => normalizeVendor(vendor.name) === norm);
                setVendorId(found?.id ?? "");
              }} placeholder="상호명 입력 또는 자동인식" className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
              <datalist id="vendor-list">{vendors.map((vendor) => <option key={vendor.id} value={vendor.name} />)}</datalist>
              <input type="hidden" name="vendor_id" value={vendorId} />
              {vendorName && !vendorId ? <span className="mt-1 block text-[11px] font-medium text-amber-700">없는 거래처면 신규 거래처 후보로 자동 등록됩니다.</span> : null}
            </label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">사업자번호</span><input name="business_number" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">거래처 연락처</span><input name="vendor_phone" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">지출 분류</span>
              <select name="category" defaultValue="materials" className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">결제수단</span>
              <select name="payment_method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                {Object.entries(EXPENSE_PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {paymentMethod === "company_card" ? <span className="mt-1 block text-[11px] font-bold text-red-700">법인카드는 영수증 첨부 없이는 제출할 수 없습니다.</span> : null}
            </label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">지출일</span><input name="expense_date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">공급가</span>
              <input name="supply_amount" type="number" min="0" step="1" value={supplyAmount} onChange={(e) => {
                const next = Number(e.target.value) || 0;
                setSupplyAmount(next);
                setTotalAmount(next + vatAmount);
              }} required className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">부가세</span>
              <input name="vat_amount" type="number" min="0" step="1" value={vatAmount} onChange={(e) => {
                const next = Number(e.target.value) || 0;
                setVatAmount(next);
                setTotalAmount(supplyAmount + next);
              }} required className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">합계</span><input name="total_amount" type="number" min="1" step="1" value={totalAmount} onChange={(e) => setTotalAmount(Number(e.target.value) || 0)} required className={`min-h-11 w-full rounded-lg border px-3 text-sm font-bold ${supplyAmount + vatAmount === totalAmount ? "border-gray-300" : "border-red-400 bg-red-50"}`} />{supplyAmount + vatAmount !== totalAmount ? <span className="mt-1 block text-[11px] font-bold text-red-700">공급가 + 부가세가 합계와 다릅니다.</span> : null}</label>

            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">지출내용</span><input name="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="예: 현관 타일 자재 구입" className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">지급예정일</span><input name="payment_due_date" type="date" className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">메모</span><input name="memo" placeholder="추가 확인사항" className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
            <div className="flex items-end">
              <input type="hidden" name="ai_extracted" value={analysis ? JSON.stringify({
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
              }) : "{}"} />
              <input type="hidden" name="ai_confidence" value={analysis?.confidence ?? 0} />
              <button type="submit" disabled={submitting || analysisBusy || !projectId || supplyAmount + vatAmount !== totalAmount} className="min-h-11 w-full rounded-lg bg-navy-900 px-4 text-sm font-bold text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? "제출 중..." : isFinanceAdmin ? "지출 등록" : "지출요청 제출"}
              </button>
            </div>
          </form>
        )}
      </section>

      {isFinanceAdmin && pendingVendors.length > 0 ? (
        <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 sm:p-5">
          <h2 className="font-bold text-violet-950">신규 거래처 확인</h2>
          <p className="mt-1 text-xs text-violet-800">증빙에서 새로 인식된 거래처 후보입니다.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingVendors.map((vendor) => (
              <div key={vendor.id} className="rounded-lg border border-violet-200 bg-white p-3">
                <p className="font-bold text-slate-950">{vendor.name}</p>
                <p className="mt-1 text-xs text-slate-600">{vendor.business_number || "사업자번호 미입력"}</p>
                <button disabled={pending} onClick={() => runAdminAction(() => approveVendorAction(vendor.id))} className="mt-3 min-h-10 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white">거래처 승인</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isFinanceAdmin ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-bold text-amber-950">지출 승인대기</h2><p className="mt-1 text-xs text-amber-800">일반 지출은 바로 승인하고, 사후지출은 처리방법까지 정한 뒤 승인합니다.</p></div>
            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-950">{pendingRequests.length}건</span>
          </div>
          {pendingRequests.length === 0 ? <p className="mt-4 rounded-lg bg-white/70 px-4 py-5 text-center text-sm text-amber-900">승인대기 지출이 없습니다.</p> : (
            <div className="mt-4 space-y-3">
              {pendingRequests.map((row) => (
                <div key={row.id} className={`rounded-xl border bg-white p-4 ${row.is_post_settlement ? "border-orange-300" : "border-amber-200"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">{row.projects?.name ?? "현장"} · {money(row.total_amount)}</p>
                        {row.is_post_settlement ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">사후지출</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{row.vendor_name_snapshot || "거래처 미지정"} · {EXPENSE_CATEGORY_LABELS[row.category]} · {row.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.requested_employee ? `${row.requested_employee.name} ${row.requested_employee.title}` : "관리자"} 등록 · 증빙 {row.expense_documents?.length ?? 0}건</p>
                    </div>
                    {!row.is_post_settlement ? (
                      <div className="flex flex-wrap gap-2">
                        <button disabled={pending} onClick={() => runAdminAction(() => approveExpenseRequestAction(row.id))} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">승인</button>
                        <RejectButton row={row} pending={pending} run={runAdminAction} />
                      </div>
                    ) : null}
                  </div>

                  {row.is_post_settlement ? (
                    <PostSettlementApproval
                      row={row}
                      employees={adjustmentEmployees}
                      pending={pending}
                      onApprove={(input) => runAdminAction(() => resolveAndApprovePostSettlementExpenseAction(input))}
                      onReject={() => {
                        const reason = window.prompt("반려 사유를 입력해 주세요.");
                        if (reason?.trim()) runAdminAction(() => rejectExpenseRequestAction(row.id, reason));
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
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
          <h2 className="font-bold text-emerald-950">지급 대기</h2>
          <div className="mt-3 space-y-3">
            {approvedRequests.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-950">{row.projects?.name ?? "현장"} · {row.vendor_name_snapshot ?? "거래처"} · {money(row.total_amount)}</p>{row.is_post_settlement ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">사후지출</span> : null}</div>
                  <p className="mt-1 text-xs text-slate-600">{row.description}</p>
                  {row.is_post_settlement && row.post_settlement_treatment ? <p className="mt-1 text-xs font-semibold text-orange-800">{POST_SETTLEMENT_TREATMENT_LABELS[row.post_settlement_treatment]}{row.settlement_adjustment_amount > 0 ? ` · 정산조정 ${money(row.settlement_adjustment_amount)}` : ""}</p> : null}
                </div>
                <button disabled={pending} onClick={() => runAdminAction(() => markExpensePaidAction(row.id, row.payment_method))} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">지급완료</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeAdjustments.length > 0 ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-indigo-950">{isFinanceAdmin ? "다음 정산 차감 대기" : "내 정산 조정 예정"}</h2>
              <p className="mt-1 text-xs text-indigo-800">사후지출 때문에 이전 정산에서 조정할 금액입니다. 다른 현장 손익에는 섞지 않고 다음 직원 정산에서 별도 차감합니다.</p>
            </div>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-900">{activeAdjustments.length}건</span>
          </div>
          <div className="mt-3 space-y-2">
            {activeAdjustments.map((item) => (
              <div key={item.id} className="rounded-lg border border-indigo-200 bg-white px-4 py-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold text-slate-950">{item.employee ? `${item.employee.name} ${item.employee.title}` : "직원"} · 잔액 {money(item.remaining_amount)}</p>
                  <p className="text-xs text-slate-500">원현장 {item.source_project?.name ?? "-"}</p>
                </div>
                <p className="mt-1 text-xs text-slate-600">{item.reason || item.source_expense?.description || "사후지출 정산조정"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5"><h2 className="font-bold text-slate-950">지출 이력</h2><p className="mt-1 text-xs text-slate-600">승인·지급·반려·취소 이력을 보존하고 사후지출은 별도로 표시합니다.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-600"><tr><th className="px-4 py-3">상태</th><th className="px-4 py-3">현장</th><th className="px-4 py-3">거래처 / 내용</th><th className="px-4 py-3">결제</th><th className="px-4 py-3 text-right">금액</th><th className="px-4 py-3">증빙</th><th className="px-4 py-3">신청자</th></tr></thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3"><Status status={row.status} />{row.is_post_settlement ? <span className="ml-1 inline-flex rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-800">사후</span> : null}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.projects?.name ?? "-"}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{row.vendor_name_snapshot ?? "-"}</p><p className="max-w-xs truncate text-xs text-slate-500">{row.description}</p></td>
                  <td className="px-4 py-3">{EXPENSE_PAYMENT_LABELS[row.payment_method]}</td>
                  <td className="px-4 py-3 text-right font-bold">{money(row.total_amount)}</td>
                  <td className="px-4 py-3">{row.expense_documents?.length ?? 0}건</td>
                  <td className="px-4 py-3 text-slate-600">{row.requested_employee ? `${row.requested_employee.name} ${row.requested_employee.title}` : "관리자"}</td>
                </tr>
              ))}
              {requests.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">등록된 지출이 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RejectButton({ row, pending, run }: { row: ExpenseRequestRecord; pending: boolean; run: (fn: () => Promise<ExpenseActionResult>) => void }) {
  return (
    <button disabled={pending} onClick={() => {
      const reason = window.prompt("반려 사유를 입력해 주세요.");
      if (reason?.trim()) run(() => rejectExpenseRequestAction(row.id, reason));
    }} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700">반려</button>
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
  const [treatment, setTreatment] = useState<PostSettlementTreatment>("company_absorb");
  const [employeeId, setEmployeeId] = useState(row.requested_by_employee_id ?? employees[0]?.id ?? "");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [recoveryAmount, setRecoveryAmount] = useState(0);
  const [note, setNote] = useState("");

  const canApprove = treatment === "next_settlement_deduction"
    ? Boolean(employeeId) && adjustmentAmount > 0 && adjustmentAmount <= row.total_amount
    : treatment === "vendor_recovery" || treatment === "customer_rebill"
      ? recoveryAmount > 0 && recoveryAmount <= row.total_amount
      : true;

  return (
    <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4">
      <p className="text-sm font-bold text-orange-950">정산완료 후 추가비용 처리</p>
      <p className="mt-1 text-xs leading-relaxed text-orange-800">원래 현장의 실제손익에는 이 비용 전체가 반영됩니다. 아래 선택은 직원정산·회수 처리방법만 결정합니다.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="mb-1 block text-xs font-semibold text-slate-700">발생 사유</span><select value={reason} onChange={(e) => setReason(e.target.value as PostSettlementReason)} className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm">{Object.entries(POST_SETTLEMENT_REASON_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-700">처리 방법</span><select value={treatment} onChange={(e) => setTreatment(e.target.value as PostSettlementTreatment)} className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm">{Object.entries(POST_SETTLEMENT_TREATMENT_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>

        {treatment === "next_settlement_deduction" ? (
          <>
            <label><span className="mb-1 block text-xs font-semibold text-slate-700">차감 대상 직원</span><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm"><option value="">직원 선택</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-semibold text-slate-700">다음 정산 차감액</span><input type="number" min="1" max={row.total_amount} value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(Number(e.target.value) || 0)} className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm" /><div className="mt-1 flex gap-1"><button type="button" onClick={() => setAdjustmentAmount(Math.round(row.total_amount * 0.5))} className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-orange-800 ring-1 ring-orange-200">50% 계산</button><button type="button" onClick={() => setAdjustmentAmount(row.total_amount)} className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-orange-800 ring-1 ring-orange-200">전액</button></div></label>
          </>
        ) : null}

        {treatment === "vendor_recovery" || treatment === "customer_rebill" ? (
          <label><span className="mb-1 block text-xs font-semibold text-slate-700">회수/청구 예정액</span><input type="number" min="1" max={row.total_amount} value={recoveryAmount} onChange={(e) => setRecoveryAmount(Number(e.target.value) || 0)} className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm" /><button type="button" onClick={() => setRecoveryAmount(row.total_amount)} className="mt-1 rounded bg-white px-2 py-1 text-[11px] font-semibold text-orange-800 ring-1 ring-orange-200">전액 입력</button></label>
        ) : null}

        <label className="sm:col-span-2 lg:col-span-3"><span className="mb-1 block text-xs font-semibold text-slate-700">관리 메모</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="필요한 경우 귀책·회수 계획 등을 기록" className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending || !canApprove} onClick={() => onApprove({ expenseId: row.id, reason, treatment, adjustmentEmployeeId: employeeId || null, adjustmentAmount, recoveryExpectedAmount: recoveryAmount, note })} className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-bold text-white disabled:opacity-50">처리방법 저장 + 승인</button>
        <button type="button" disabled={pending} onClick={onReject} className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700">반려</button>
      </div>
    </div>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return <div className={`rounded-xl border p-4 ${tone === "warn" ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-white"}`}><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>;
}

function Status({ status }: { status: ExpenseRequestRecord["status"] }) {
  const cls = status === "paid" ? "bg-emerald-100 text-emerald-800" : status === "approved" ? "bg-sky-100 text-sky-800" : status === "pending" ? "bg-amber-100 text-amber-900" : status === "rejected" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{EXPENSE_STATUS_LABELS[status]}</span>;
}