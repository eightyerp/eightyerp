"use client";

import { useActionState } from "react";
import {
  createCrmCustomerAction,
  type CrmCreateCustomerState,
} from "@/app/actions/crm-mobile";
import type { Employee, LeadSource } from "@/types/database";

const initialState: CrmCreateCustomerState = { success: false };

const CONSULTATION_TYPES = [
  "창호",
  "종합인테리어",
  "부분인테리어",
  "주방",
  "욕실",
  "도배",
  "바닥재",
  "도어/중문",
  "기타",
] as const;

type Props = {
  employees: Employee[];
  leadSources: LeadSource[];
  defaultAssignedEmployeeId: string | null;
  canChangeAssignee: boolean;
};

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-navy-900";

export default function CrmNewCustomerForm({
  employees,
  leadSources,
  defaultAssignedEmployeeId,
  canChangeAssignee,
}: Props) {
  const [state, formAction, pending] = useActionState(
    createCrmCustomerAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            고객명 · 필수
            <input
              name="name"
              required
              autoComplete="name"
              placeholder="고객명"
              className={fieldClass}
            />
          </label>

          <label className="text-xs font-bold text-slate-600">
            연락처 · 필수
            <input
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="010-0000-0000"
              className={fieldClass}
            />
          </label>

          <label className="text-xs font-bold text-slate-600 sm:col-span-2">
            공사주소
            <input
              name="address"
              autoComplete="street-address"
              placeholder="아파트명, 동·호수 또는 공사주소"
              className={fieldClass}
            />
          </label>

          <label className="text-xs font-bold text-slate-600">
            상담유형
            <select name="consultation_type" defaultValue="종합인테리어" className={fieldClass}>
              {CONSULTATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold text-slate-600">
            유입경로
            <select name="lead_source_id" defaultValue="" className={fieldClass}>
              <option value="">선택 안 함</option>
              {leadSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          {canChangeAssignee ? (
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              담당자
              <select
                name="assigned_employee_id"
                required
                defaultValue={defaultAssignedEmployeeId ?? ""}
                className={fieldClass}
              >
                <option value="" disabled>
                  담당자 선택
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {[employee.name, employee.title].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input
              type="hidden"
              name="assigned_employee_id"
              value={defaultAssignedEmployeeId ?? ""}
            />
          )}

          <label className="text-xs font-bold text-slate-600 sm:col-span-2">
            접수 메모 · 선택
            <textarea
              name="consultation_notes"
              rows={3}
              placeholder="고객 요청사항이나 유입 내용만 짧게 입력"
              className={`${fieldClass} resize-none leading-6`}
            />
          </label>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-navy-900 px-4 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "등록 중..." : "고객 등록"}
      </button>

      <p className="px-2 text-center text-[11px] leading-5 text-slate-400">
        등록 후 고객 상세로 바로 이동합니다. 상담기록과 다음 연락은 상세화면에서 이어서 처리합니다.
      </p>
    </form>
  );
}
