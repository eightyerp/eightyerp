"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createCustomerAction,
  updateCustomerAction,
  type ActionResult,
} from "@/app/actions/customers";
import {
  CONSULTATION_TYPES,
  CUSTOMER_FORM_STATUSES,
  INTEREST_ITEMS,
  formatEmployeeLabel,
} from "@/lib/crm/constants";
import type { Customer, Employee, LeadSource } from "@/types/database";

type CustomerFormProps = {
  employees: Employee[];
  leadSources: LeadSource[];
  customer?: Customer;
};

const initialState: ActionResult = { success: false };

const ADDRESS_PLACEHOLDER =
  "서울 영등포구 당산로36길 12 당산2차삼성아파트 204동 702호";

export default function CustomerForm({
  employees,
  leadSources,
  customer,
}: CustomerFormProps) {
  const isEdit = Boolean(customer);
  const action = isEdit ? updateCustomerAction : createCustomerAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [interestItems, setInterestItems] = useState<string[]>(
    customer?.interest_items ?? [],
  );

  function toggleInterest(item: string) {
    setInterestItems((prev) =>
      prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item],
    );
  }

  return (
    <form action={formAction} className="dashboard-card space-y-5 p-5 lg:p-6">
      {customer && <input type="hidden" name="id" value={customer.id} />}

      {interestItems.map((item) => (
        <input key={item} type="hidden" name="interest_items" value={item} />
      ))}

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.success && state.message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="고객명" required>
          <input
            name="name"
            required
            defaultValue={customer?.name ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="연락처" required>
          <input
            name="phone"
            required
            placeholder="010-0000-0000"
            defaultValue={customer?.phone ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="공사주소" className="md:col-span-2">
          <textarea
            name="address"
            rows={3}
            placeholder={ADDRESS_PLACEHOLDER}
            defaultValue={customer?.address ?? ""}
            className={textareaClass}
          />
        </Field>

        <Field label="상담유형">
          <select
            name="consultation_type"
            defaultValue={
              customer?.consultation_type &&
              (CONSULTATION_TYPES.includes(customer.consultation_type) ||
                customer.consultation_type === "인테리어")
                ? customer.consultation_type
                : "기타"
            }
            className={inputClass}
          >
            {customer?.consultation_type === "인테리어" && (
              <option value="인테리어">인테리어 (기존)</option>
            )}
            {CONSULTATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="유입경로">
          <select
            name="lead_source_id"
            defaultValue={customer?.lead_source_id ?? ""}
            className={inputClass}
          >
            <option value="">선택</option>
            {leadSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="관심 공종" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {INTEREST_ITEMS.map((item) => {
              const selected = interestItems.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleInterest(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? "bg-navy-800 text-gold-400 ring-1 ring-navy-900"
                      : "bg-gray-50 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
          {interestItems.length === 0 && (
            <p className="mt-2 text-xs text-gray-400">
              해당하는 공종을 복수로 선택할 수 있습니다.
            </p>
          )}
        </Field>

        <Field label="담당자">
          <select
            name="assigned_employee_id"
            defaultValue={customer?.assigned_employee_id ?? ""}
            className={inputClass}
          >
            <option value="">미배정</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {formatEmployeeLabel(employee.name, employee.title)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="고객 상담상태">
          <select
            name="status"
            defaultValue={
              customer?.status &&
              CUSTOMER_FORM_STATUSES.includes(customer.status)
                ? customer.status
                : "신규"
            }
            className={inputClass}
          >
            {CUSTOMER_FORM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>

        <Field label="다음 연락일">
          <input
            type="date"
            name="next_contact_at"
            defaultValue={customer?.next_contact_at?.slice(0, 10) ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="해피콜 필요 여부">
          <select
            name="happy_call_required"
            defaultValue={customer?.happy_call_required ? "true" : "false"}
            className={inputClass}
          >
            <option value="false">불필요</option>
            <option value="true">필요</option>
          </select>
        </Field>

        <Field label="희망 공사시기" className="md:col-span-2">
          <input
            name="desired_timing"
            placeholder="예: 입주 전 / 3월 중 / 빠른 시일 내"
            defaultValue={customer?.desired_timing ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="고객특이사항" className="md:col-span-2">
          <textarea
            name="special_notes"
            rows={3}
            defaultValue={customer?.special_notes ?? ""}
            className={textareaClass}
          />
        </Field>

        <Field label="상담내용 / 메모" className="md:col-span-2">
          <textarea
            name="consultation_notes"
            rows={5}
            defaultValue={customer?.consultation_notes ?? ""}
            className={textareaClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending
            ? isEdit
              ? "저장 중..."
              : "등록 중..."
            : isEdit
              ? "변경 저장"
              : "고객 등록"}
        </button>
        <Link
          href="/customers"
          className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          목록으로
        </Link>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
const textareaClass = `${inputClass} resize-y`;

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
