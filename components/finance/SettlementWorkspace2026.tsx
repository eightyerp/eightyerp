"use client";

import { useActionState, useMemo, useState } from "react";
import {
  importLegacy2026SettlementAction,
  type SettlementActionResult,
} from "@/app/actions/settlements";
import type {
  SettlementEmployeeOption,
  SettlementLine,
  SettlementSummary2026,
} from "@/lib/crm/settlements";

const initialState: SettlementActionResult = { success: false };

function money(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function employeeLabel(employee: SettlementEmployeeOption) {
  const team = Array.isArray(employee.team) ? employee.team[0]?.name : employee.team?.name;
  return [employee.name, team, employee.title].filter(Boolean).join(" · ");
}

function statusLabel(status: SettlementSummary2026["status"]) {
  return {
    draft: "작성중",
    confirmed: "정산확정",
    paid: "지급완료",
    cancelled: "취소",
  }[status];
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-400";

export default function SettlementWorkspace2026({
  summaries,
  lines,
  employees,
  isFinanceAdmin,
}: {
  summaries: SettlementSummary2026[];
  lines: SettlementLine[];
  employees: SettlementEmployeeOption[];
  isFinanceAdmin: boolean;
}) {
  const [state, action, submitting] = useActionState(
    importLegacy2026SettlementAction,
    initialState,
  );
  const [baseAmount, setBaseAmount] = useState(0);
  const [additional, setAdditional] = useState(0);
  const [deduction, setDeduction] = useState(0);
  const actualPaid = Math.max(0, baseAmount + additional - deduction);

  const employeeName = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employeeLabel(employee)])),
    [employees],
  );
  const linesBySettlement = useMemo(() => {
    const map = new Map<string, SettlementLine[]>();
    for (const line of lines) {
      const list = map.get(line.settlement_id) ?? [];
      list.push(line);
      map.set(line.settlement_id, list);
    }
    return map;
  }, [lines]);

  const totals = useMemo(
    () => ({
      revenue: summaries.reduce((sum, row) => sum + Number(row.revenue_amount), 0),
      cost: summaries.reduce((sum, row) => sum + Number(row.cost_amount), 0),
      margin: summaries.reduce((sum, row) => sum + Number(row.margin_amount), 0),
      paid: summaries.reduce((sum, row) => sum + Number(row.paid_amount), 0),
    }),
    [summaries],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
        <p className="font-black text-indigo-950">정산자료는 비공개입니다.</p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-800">
          {isFinanceAdmin
            ? "대표·이사·관리자만 전체 직원 정산을 볼 수 있습니다. 일반 직원과 팀장은 본인 정산자료만 조회됩니다."
            : "이 화면에는 본인의 정산자료만 표시됩니다. 다른 직원의 정산금액은 조회할 수 없습니다."}
        </p>
      </section>

      {isFinanceAdmin ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-black uppercase tracking-wide text-sky-700">2026 기존자료</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">기정산 간편 이관</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              2026년에 실제 지급한 건만 매출·원가·정산·인센·차감의 큰 금액으로 입력합니다.
            </p>
          </div>
          <form action={action} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">직원 *</span>
              <select name="employee_id" required className={fieldClass} defaultValue="">
                <option value="">직원 선택</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">실제 지급일 *</span>
              <input name="payout_date" type="date" min="2026-01-01" max="2026-12-31" required className={fieldClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">현장명</span>
              <input name="project_name" placeholder="기존 엑셀의 현장명" className={fieldClass} />
              <input type="hidden" name="project_id" value="" />
            </label>
            <MoneyField name="revenue_amount" label="매출액" />
            <MoneyField name="cost_amount" label="매출원가" />
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">기본 정산금액</span>
              <input name="base_settlement_amount" type="number" min="0" step="1" value={baseAmount || ""} onChange={(e) => setBaseAmount(Number(e.target.value) || 0)} className={fieldClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">추가 인센티브</span>
              <input name="additional_incentive_amount" type="number" min="0" step="1" value={additional || ""} onChange={(e) => setAdditional(Number(e.target.value) || 0)} className={fieldClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">차감액</span>
              <input name="deduction_amount" type="number" min="0" step="1" value={deduction || ""} onChange={(e) => setDeduction(Number(e.target.value) || 0)} className={fieldClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-black text-slate-900">실제 지급액</span>
              <input name="actual_paid_amount" type="number" readOnly value={actualPaid} className={`${fieldClass} bg-slate-50 text-lg font-black`} />
            </label>
            <label className="md:col-span-2 xl:col-span-3">
              <span className="mb-1.5 block text-sm font-black text-slate-900">메모</span>
              <input name="memo" placeholder="예: 기존 Excel 정산자료 이관 / 특별인센 포함" className={fieldClass} />
            </label>

            {state.message || state.error ? (
              <div className={`md:col-span-2 xl:col-span-3 rounded-xl px-4 py-3 text-sm font-bold ${state.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
                {state.error || state.message}
              </div>
            ) : null}

            <div className="md:col-span-2 xl:col-span-3 flex justify-end">
              <button disabled={submitting} className="min-h-12 rounded-xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-50">
                {submitting ? "이관 중..." : "기정산 확정 이관"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="2026 매출" value={money(totals.revenue)} />
        <Summary label="2026 원가" value={money(totals.cost)} />
        <Summary label="2026 마진" value={money(totals.margin)} />
        <Summary label="2026 실제 지급" value={money(totals.paid)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">2026 정산내역</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {isFinanceAdmin ? "직원별 지급기준 정산내역입니다." : "내 지급기준 정산내역입니다."}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black text-slate-700">
              <tr>
                {isFinanceAdmin ? <th className="px-4 py-3">직원</th> : null}
                <th className="px-4 py-3">지급일</th>
                <th className="px-4 py-3">현장</th>
                <th className="px-4 py-3 text-right">매출</th>
                <th className="px-4 py-3 text-right">원가</th>
                <th className="px-4 py-3 text-right">마진</th>
                <th className="px-4 py-3 text-right">기본정산</th>
                <th className="px-4 py-3 text-right">추가인센</th>
                <th className="px-4 py-3 text-right">차감</th>
                <th className="px-4 py-3 text-right">실제지급</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => {
                const rowLines = linesBySettlement.get(row.id) ?? [];
                const mainLine = rowLines.find((line) => line.line_type === "legacy_project" || line.line_type === "project_settlement");
                return (
                  <tr key={row.id} className="border-t border-slate-100 text-slate-800">
                    {isFinanceAdmin ? <td className="px-4 py-3 font-black text-slate-950">{employeeName.get(row.employee_id) ?? "직원"}</td> : null}
                    <td className="px-4 py-3 font-semibold">{row.payout_date ?? "-"}</td>
                    <td className="px-4 py-3 font-bold text-slate-950">{mainLine?.project_name_snapshot ?? "정산"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(row.revenue_amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(row.cost_amount)}</td>
                    <td className="px-4 py-3 text-right font-black">{money(row.margin_amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(row.base_settlement_amount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">+{money(row.additional_incentive_amount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">-{money(row.deduction_amount)}</td>
                    <td className="px-4 py-3 text-right font-black text-slate-950">{money(row.paid_amount || row.final_payable_amount)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{statusLabel(row.status)}</span></td>
                  </tr>
                );
              })}
              {summaries.length === 0 ? (
                <tr><td colSpan={isFinanceAdmin ? 11 : 10} className="px-4 py-12 text-center font-semibold text-slate-500">2026 정산자료가 아직 없습니다.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MoneyField({ name, label }: { name: string; label: string }) {
  return (
    <label>
      <span className="mb-1.5 block text-sm font-black text-slate-900">{label}</span>
      <input name={name} type="number" min="0" step="1" defaultValue="0" className={fieldClass} />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
