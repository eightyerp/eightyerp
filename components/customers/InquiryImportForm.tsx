"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  analyzeInquiryAction,
  registerInquiryCustomerAction,
  type ActionResult,
} from "@/app/actions/customers";
import {
  CONSULTATION_TYPES,
  CUSTOMER_FORM_STATUSES,
  formatEmployeeLabel,
} from "@/lib/crm/constants";
import { interestItemsToInput } from "@/lib/crm/parse-inquiry";
import type {
  ConsultationType,
  CustomerStatus,
  Employee,
  InquirySourceType,
  LeadSource,
} from "@/types/database";

type InquiryImportFormProps = {
  employees: Employee[];
  leadSources: LeadSource[];
  defaultAssignedEmployeeId?: string | null;
};

type FormState = {
  raw_text: string;
  source_type: InquirySourceType;
  name: string;
  phone: string;
  address: string;
  lead_source_id: string;
  lead_source_name: string;
  consultation_type: ConsultationType;
  interest_items: string;
  desired_timing: string;
  special_notes: string;
  event_memo: string;
  consultation_notes: string;
  source_order_no: string;
  source_channel: string;
  source_round: string;
  assigned_employee_id: string;
  status: CustomerStatus;
  next_contact_at: string;
  happy_call_required: boolean;
};

const emptyForm: FormState = {
  raw_text: "",
  source_type: "other",
  name: "",
  phone: "",
  address: "",
  lead_source_id: "",
  lead_source_name: "",
  consultation_type: "기타",
  interest_items: "",
  desired_timing: "",
  special_notes: "",
  event_memo: "",
  consultation_notes: "",
  source_order_no: "",
  source_channel: "",
  source_round: "",
  assigned_employee_id: "",
  status: "신규",
  next_contact_at: "",
  happy_call_required: true,
};

const initialAction: ActionResult = { success: false };

export default function InquiryImportForm({
  employees,
  leadSources,
  defaultAssignedEmployeeId = null,
}: InquiryImportFormProps) {
  const [form, setForm] = useState<FormState>({
    ...emptyForm,
    assigned_employee_id: defaultAssignedEmployeeId ?? "",
  });
  const [analyzeState, analyzeAction, analyzing] = useActionState(
    analyzeInquiryAction,
    initialAction,
  );
  const [registerState, registerAction, registering] = useActionState(
    registerInquiryCustomerAction,
    initialAction,
  );

  useEffect(() => {
    if (!analyzeState.success || !analyzeState.parsed) return;

    const parsed = analyzeState.parsed;
    const matchedSource = leadSources.find(
      (source) => source.name === parsed.lead_source_name,
    );

    const id = window.setTimeout(() => {
      setForm((prev) => ({
        ...prev,
        source_type: analyzeState.sourceType ?? prev.source_type,
        name: parsed.name ?? "",
        phone: parsed.phone ?? "",
        address: parsed.address ?? "",
        lead_source_id: matchedSource?.id ?? "",
        lead_source_name: parsed.lead_source_name ?? "",
        consultation_type: parsed.consultation_type ?? "기타",
        interest_items: interestItemsToInput(parsed.interest_items),
        desired_timing: parsed.desired_timing ?? "",
        special_notes: parsed.special_notes ?? "",
        event_memo: parsed.event_memo ?? "",
        consultation_notes: parsed.consultation_notes ?? "",
        source_order_no: parsed.source_order_no ?? "",
        source_channel: parsed.source_channel ?? "",
        source_round: parsed.source_round ?? "",
        assigned_employee_id:
          parsed.assigned_employee_id ||
          prev.assigned_employee_id ||
          defaultAssignedEmployeeId ||
          "",
        status: parsed.status ?? "신규",
        next_contact_at: parsed.next_contact_at ?? "",
        happy_call_required:
          parsed.happy_call_required === undefined
            ? true
            : Boolean(parsed.happy_call_required),
      }));
    }, 0);
    return () => window.clearTimeout(id);
  }, [analyzeState, leadSources, defaultAssignedEmployeeId]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleReset() {
    setForm({
      ...emptyForm,
      assigned_employee_id: defaultAssignedEmployeeId ?? "",
    });
  }

  function assignFirstEmployee() {
    if (employees[0]) {
      updateField("assigned_employee_id", employees[0].id);
    }
  }

  const error = registerState.error || analyzeState.error;
  const successMessage =
    !error && analyzeState.success ? analyzeState.message : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="dashboard-card p-5">
        <h2 className="dashboard-section-title">문의 원문</h2>
        <p className="mt-1 text-xs text-gray-500">
          온라인 문의, 문자, 카카오톡, LX하우시스 본사 상담내용을 붙여넣으세요.
        </p>

        <form action={analyzeAction} className="mt-4 space-y-4">
          <textarea
            name="raw_text"
            value={form.raw_text}
            onChange={(e) => updateField("raw_text", e.target.value)}
            rows={22}
            placeholder="문의 내용을 붙여넣으세요..."
            className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
          <button
            type="submit"
            disabled={analyzing}
            className="rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-navy-900 hover:brightness-105 disabled:opacity-60"
          >
            {analyzing ? "분석 중..." : "내용 분석"}
          </button>
        </form>
      </section>

      <section className="dashboard-card p-5">
        <h2 className="dashboard-section-title">분석 결과 / 등록</h2>

        {(error || successMessage) && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              error
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {error || successMessage}
          </div>
        )}

        <form action={registerAction} className="mt-4 space-y-4">
          <input type="hidden" name="raw_text" value={form.raw_text} />
          <input type="hidden" name="source_type" value={form.source_type} />
          <input
            type="hidden"
            name="lead_source_name"
            value={form.lead_source_name}
          />
          <input
            type="hidden"
            name="happy_call_required"
            value={form.happy_call_required ? "true" : "false"}
          />
          <input type="hidden" name="duplicate_mode" value="create" />
          <input type="hidden" name="force_create" value="1" />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="고객명">
              <input
                name="name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="연락처">
              <input
                name="phone"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="공사주소" className="md:col-span-2">
              <input
                name="address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="유입경로">
              <select
                name="lead_source_id"
                value={form.lead_source_id}
                onChange={(e) => {
                  const source = leadSources.find((s) => s.id === e.target.value);
                  updateField("lead_source_id", e.target.value);
                  updateField("lead_source_name", source?.name ?? "");
                }}
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
            <Field label="상담유형">
              <select
                name="consultation_type"
                value={form.consultation_type}
                onChange={(e) =>
                  updateField(
                    "consultation_type",
                    e.target.value as ConsultationType,
                  )
                }
                className={inputClass}
              >
                {CONSULTATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="채널">
              <input
                name="source_channel"
                value={form.source_channel}
                onChange={(e) => updateField("source_channel", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="차수">
              <input
                name="source_round"
                value={form.source_round}
                onChange={(e) => updateField("source_round", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="주문번호">
              <input
                name="source_order_no"
                value={form.source_order_no}
                onChange={(e) => updateField("source_order_no", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="관심 공종">
              <input
                name="interest_items"
                value={form.interest_items}
                onChange={(e) => updateField("interest_items", e.target.value)}
                placeholder="쉼표 또는 / 구분"
                className={inputClass}
              />
            </Field>
            <Field label="희망 공사시기" className="md:col-span-2">
              <input
                name="desired_timing"
                value={form.desired_timing}
                onChange={(e) => updateField("desired_timing", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="고객특이사항" className="md:col-span-2">
              <textarea
                name="special_notes"
                value={form.special_notes}
                onChange={(e) => updateField("special_notes", e.target.value)}
                rows={2}
                className={textareaClass}
              />
            </Field>
            <Field label="메모" className="md:col-span-2">
              <textarea
                name="event_memo"
                value={form.event_memo}
                onChange={(e) => updateField("event_memo", e.target.value)}
                rows={2}
                className={textareaClass}
              />
            </Field>
            <Field label="담당자" required>
              <select
                name="assigned_employee_id"
                required
                value={form.assigned_employee_id}
                onChange={(e) =>
                  updateField("assigned_employee_id", e.target.value)
                }
                className={inputClass}
              >
                <option value="">담당자 선택</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {formatEmployeeLabel(employee.name, employee.title)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="고객상태">
              <select
                name="status"
                value={form.status}
                onChange={(e) =>
                  updateField("status", e.target.value as CustomerStatus)
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
                value={form.next_contact_at}
                onChange={(e) => updateField("next_contact_at", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="해피콜 필요">
              <div className="flex h-[38px] items-center gap-2 text-sm text-gray-700">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    form.happy_call_required
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {form.happy_call_required ? "필요" : "해당없음"}
                </span>
              </div>
            </Field>
            <Field label="상담내용" className="md:col-span-2">
              <textarea
                name="consultation_notes"
                value={form.consultation_notes}
                onChange={(e) =>
                  updateField("consultation_notes", e.target.value)
                }
                rows={3}
                className={textareaClass}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <button
              type="submit"
              disabled={registering}
              className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {registering ? "등록 중..." : "고객으로 등록"}
            </button>
            <button
              type="button"
              onClick={assignFirstEmployee}
              className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2.5 text-sm font-medium text-navy-800 hover:bg-gold-500/20"
            >
              담당자 배정
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              초기화
            </button>
            <Link
              href="/customers"
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              목록으로
            </Link>
          </div>
        </form>
      </section>
    </div>
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
      <label className="mb-1 block text-xs font-medium text-gray-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
