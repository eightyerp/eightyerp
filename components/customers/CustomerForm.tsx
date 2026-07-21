"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  checkCustomerPhoneDuplicateAction,
  createCustomerAction,
  updateCustomerAction,
  type ActionResult,
} from "@/app/actions/customers";
import type { DuplicateCandidate } from "@/lib/crm/inquiry-duplicates";
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
  /** 신규 등록 시 기본 담당자 (수정 시에는 사용하지 않음) */
  defaultAssignedEmployeeId?: string | null;
  isAdmin?: boolean;
};

const initialState: ActionResult = { success: false };

const ADDRESS_PLACEHOLDER =
  "서울 영등포구 당산로36길 12 당산2차삼성아파트 204동 702호";

export default function CustomerForm({
  employees,
  leadSources,
  customer,
  defaultAssignedEmployeeId = null,
  isAdmin = false,
}: CustomerFormProps) {
  const isEdit = Boolean(customer);
  const action = isEdit ? updateCustomerAction : createCustomerAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [interestItems, setInterestItems] = useState<string[]>(
    customer?.interest_items ?? [],
  );
  const [phoneDuplicates, setPhoneDuplicates] = useState<DuplicateCandidate[]>(
    [],
  );
  const [checkingPhone, startPhoneCheck] = useTransition();

  const defaultAssignee = isEdit
    ? (customer?.assigned_employee_id ?? "")
    : (defaultAssignedEmployeeId ?? "");

  function toggleInterest(item: string) {
    setInterestItems((prev) =>
      prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item],
    );
  }

  function checkPhone(raw: string) {
    startPhoneCheck(async () => {
      const { duplicates } = await checkCustomerPhoneDuplicateAction(
        raw,
        customer?.id,
      );
      setPhoneDuplicates(duplicates);
    });
  }

  const submitLabel = pending
    ? isEdit
      ? "저장 중..."
      : "등록 중..."
    : isEdit
      ? "변경 저장"
      : "고객 등록";

  const visibleDuplicates =
    phoneDuplicates.length > 0
      ? phoneDuplicates
      : (state.duplicates ?? []);

  return (
    <form
      action={formAction}
      className="dashboard-card space-y-5 p-4 pb-28 sm:p-5 md:pb-6 lg:p-6"
    >
      {customer && <input type="hidden" name="id" value={customer.id} />}

      {interestItems.map((item) => (
        <input key={item} type="hidden" name="interest_items" value={item} />
      ))}

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.diagnosticHint && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.diagnosticHint}
        </div>
      )}

      {state.success && state.message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {state.message}
        </div>
      )}

      {visibleDuplicates.length > 0 && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            같은 연락처의 고객이 이미 있습니다
          </p>
          <ul className="space-y-2">
            {visibleDuplicates.map((dup) => (
              <li
                key={dup.id}
                className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-navy-900">{dup.name}</p>
                  <p className="text-xs text-amber-900/80">
                    담당자 {dup.assignee_name ?? "미배정"}
                    {dup.status ? ` · ${dup.status}` : ""}
                    {dup.phone ? ` · ${dup.phone}` : ""}
                  </p>
                </div>
                <Link
                  href={`/customers/${dup.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-navy-800/20 bg-navy-800 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-700 sm:min-h-9"
                >
                  기존 고객 열기
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            등록을 이어가려면 연락처를 바꾸거나, 위 버튼을 눌러 기존 고객을
            확인하세요.
          </p>
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
            onBlur={(e) => checkPhone(e.target.value)}
            onChange={() => {
              if (phoneDuplicates.length > 0) setPhoneDuplicates([]);
            }}
          />
          {checkingPhone && (
            <p className="mt-1 text-xs text-gray-400">연락처 확인 중…</p>
          )}
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
                  className={`min-h-11 rounded-full px-3 py-2 text-xs font-medium transition md:min-h-0 md:py-1.5 ${
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

        <Field label="담당자" required>
          <select
            name="assigned_employee_id"
            required
            defaultValue={defaultAssignee}
            className={inputClass}
          >
            <option value="">담당자 선택</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {formatEmployeeLabel(employee.name, employee.title)}
              </option>
            ))}
          </select>
          {!isEdit && defaultAssignedEmployeeId && (
            <p className="mt-1 text-xs text-gray-400">
              {isAdmin
                ? "로그인 직원으로 기본 선택되었습니다. 관리자는 다른 담당자로 변경할 수 있습니다."
                : "로그인 직원이 기본 담당자로 선택되었습니다."}
            </p>
          )}
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

      {/* Desktop / tablet actions */}
      <div className="hidden flex-wrap gap-2 border-t border-gray-100 pt-4 md:flex">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {submitLabel}
        </button>
        <Link
          href="/customers"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          목록으로
        </Link>
      </div>

      {/* Mobile sticky actions — 저장 + 목록 분리, 겹침 없음 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-3 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-4xl gap-2 pb-[env(safe-area-inset-bottom)]">
          <Link
            href="/customers"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
          >
            목록
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 flex-[1.6] items-center justify-center rounded-lg bg-navy-800 px-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 md:min-h-10 md:py-2 md:text-sm";
const textareaClass = `${inputClass} resize-y min-h-[6.5rem]`;

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
