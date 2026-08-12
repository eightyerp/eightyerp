"use client";

import { useActionState } from "react";
import {
  registerQuickCompanyCardExpenseAction,
  type QuickCardExpenseResult,
} from "@/app/actions/expense-quick-card";
import type { ExpenseProjectOption } from "@/lib/crm/expense-shared";

const initialState: QuickCardExpenseResult = { success: false };

function todayKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function AdminQuickCardExpense({
  projects,
}: {
  projects: ExpenseProjectOption[];
}) {
  const [state, action, pending] = useActionState(
    registerQuickCompanyCardExpenseAction,
    initialState,
  );

  if (projects.length === 0) return null;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-bold text-indigo-950">법인카드 간편등록</h2>
          <p className="mt-1 text-xs leading-relaxed text-indigo-800">
            영수증이 없어도 현장과 총 결제금액만 먼저 등록할 수 있습니다. 공급가·부가세 구분은 미확인으로 남기고 영수증이 생기면 나중에 보완합니다.
          </p>
        </div>
        <span className="w-fit rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-900">
          관리자 전용
        </span>
      </div>

      {state.message || state.error ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
            state.error ? "bg-red-50 text-red-800" : "bg-white text-indigo-900"
          }`}
        >
          {state.message ?? state.error}
        </p>
      ) : null}

      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="sm:col-span-2 xl:col-span-2">
          <span className="mb-1 block text-xs font-bold text-slate-700">현장 *</span>
          <select
            name="project_id"
            required
            defaultValue=""
            className="min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm"
          >
            <option value="">현장을 선택하세요</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.customers?.name ?? "고객"} · {project.name}
                {project.address ? ` · ${project.address}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-bold text-slate-700">총 결제금액 *</span>
          <input
            name="total_amount"
            type="number"
            min="1"
            step="1"
            required
            placeholder="예: 185000"
            className="min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm font-bold"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-700">결제일</span>
          <input
            name="expense_date"
            type="date"
            defaultValue={todayKorea()}
            className="min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-700">사용처</span>
          <input
            name="vendor_name"
            placeholder="예: 이마트 영등포점"
            className="min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm"
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 w-full rounded-lg bg-indigo-700 px-4 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {pending ? "등록 중..." : "법인카드 총액 등록"}
          </button>
        </div>

        <label className="sm:col-span-2 xl:col-span-6">
          <span className="mb-1 block text-xs font-semibold text-slate-700">내용</span>
          <input
            name="description"
            placeholder="비워두면 사용처 + 법인카드 사용으로 자동 기록"
            className="min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm"
          />
        </label>
      </form>
    </section>
  );
}
