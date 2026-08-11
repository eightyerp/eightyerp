"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  analyzeInquiryAction,
  registerInquiryCustomerAction,
  type ActionResult,
} from "@/app/actions/customers";
import {
  CUSTOMER_FORM_STATUSES,
  INTEREST_ITEMS,
  formatEmployeeOptionLabel,
} from "@/lib/crm/constants";
import type { InquiryMissingField } from "@/lib/crm/parse-inquiry";
import type {
  CustomerStatus,
  EmployeeOption,
  InquirySourceType,
  LeadSourceOption,
  ParsedInquiryData,
} from "@/types/database";

type Props = {
  employees: EmployeeOption[];
  leadSources: LeadSourceOption[];
  defaultAssignedEmployeeId?: string | null;
  canChangeAssignee?: boolean;
};

type PreviewState = {
  raw_text: string;
  source_type: InquirySourceType;
  name: string;
  phone: string;
  address: string;
  lead_source_id: string;
  lead_source_name: string;
  source_channel: string;
  source_round: string;
  source_order_no: string;
  interest_items: string[];
  desired_timing: string;
  special_notes: string;
  event_memo: string;
  consultation_notes: string;
  assigned_employee_id: string;
  status: CustomerStatus;
  happy_call_required: boolean;
};

const emptyPreview: PreviewState = {
  raw_text: "",
  source_type: "other",
  name: "",
  phone: "",
  address: "",
  lead_source_id: "",
  lead_source_name: "",
  source_channel: "",
  source_round: "",
  source_order_no: "",
  interest_items: [],
  desired_timing: "",
  special_notes: "",
  event_memo: "",
  consultation_notes: "",
  assigned_employee_id: "",
  status: "신규",
  happy_call_required: true,
};

const initial: ActionResult = { success: false };

const MISSING_LABEL: Record<InquiryMissingField, string> = {
  name: "고객명",
  phone: "연락처",
  address: "공사주소",
  source_order_no: "주문번호",
  source_channel: "채널",
  source_round: "차수",
  interest_items: "관심 공종",
  desired_timing: "상담 희망시기",
};

const REASON_LABEL = {
  source_order_no: "주문번호 일치",
  phone: "연락처 일치",
  name_address: "고객명+주소 일치",
} as const;

function fieldClass(missing: boolean) {
  return missing
    ? "min-h-11 w-full rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-sm"
    : "min-h-11 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm";
}

export default function ExternalInquiryPasteModal({
  employees,
  leadSources,
  defaultAssignedEmployeeId = null,
  canChangeAssignee = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"paste" | "preview">("paste");
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<PreviewState>({
    ...emptyPreview,
    assigned_employee_id: defaultAssignedEmployeeId ?? "",
  });
  const [missing, setMissing] = useState<InquiryMissingField[]>([]);
  const [duplicates, setDuplicates] = useState<ActionResult["duplicates"]>([]);
  const [dupMode, setDupMode] = useState<"create" | "append" | "view">("create");
  const [selectedExisting, setSelectedExisting] = useState("");

  const [analyzeState, analyzeAction, analyzing] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await analyzeInquiryAction(prev, formData);
      if (!result.success || !result.parsed) return result;

      const parsed = result.parsed as ParsedInquiryData;
      const text = String(formData.get("raw_text") ?? rawText);
      const matched =
        leadSources.find((s) => s.name === parsed.lead_source_name) ||
        leadSources.find((s) => s.name === "LX하우시스 본사") ||
        leadSources.find((s) => s.name === "LX하우시스 고객상담실");

      setPreview({
        raw_text: text,
        source_type: result.sourceType ?? "other",
        name: parsed.name ?? "",
        phone: parsed.phone ?? "",
        address: parsed.address ?? "",
        lead_source_id: matched?.id ?? "",
        lead_source_name: parsed.lead_source_name ?? matched?.name ?? "",
        source_channel: parsed.source_channel ?? "",
        source_round: parsed.source_round ?? "",
        source_order_no: parsed.source_order_no ?? "",
        interest_items: parsed.interest_items ?? [],
        desired_timing: parsed.desired_timing ?? "",
        special_notes: parsed.special_notes ?? "",
        event_memo: parsed.event_memo ?? "",
        consultation_notes: parsed.consultation_notes ?? "",
        assigned_employee_id:
          parsed.assigned_employee_id || defaultAssignedEmployeeId || "",
        status: parsed.status ?? "신규",
        happy_call_required: parsed.happy_call_required ?? true,
      });
      setMissing(result.missingFields ?? []);
      setDuplicates(result.duplicates ?? []);
      setDupMode(result.duplicates?.length ? "view" : "create");
      setSelectedExisting(result.duplicates?.[0]?.id ?? "");
      setStep("preview");
      return result;
    },
    initial,
  );
  const [registerState, registerAction, registering] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await registerInquiryCustomerAction(prev, formData);
      if (result.duplicates?.length) {
        setDuplicates(result.duplicates);
      }
      return result;
    },
    initial,
  );

  function close() {
    setOpen(false);
    setStep("paste");
    setRawText("");
    setPreview({
      ...emptyPreview,
      assigned_employee_id: defaultAssignedEmployeeId ?? "",
    });
    setMissing([]);
    setDuplicates([]);
    setDupMode("create");
    setSelectedExisting("");
  }

  function toggleInterest(item: string) {
    setPreview((prev) => ({
      ...prev,
      interest_items: prev.interest_items.includes(item)
        ? prev.interest_items.filter((v) => v !== item)
        : [...prev.interest_items, item],
    }));
  }

  const isMissing = (key: InquiryMissingField) => missing.includes(key);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2.5 text-sm font-medium text-navy-800 hover:bg-gold-500/20"
      >
        외부문의 붙여넣기
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-navy-900">
                  외부문의 붙여넣기 자동등록
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {step === "paste"
                    ? "상담문 전체를 붙여 넣은 뒤 내용을 분석합니다."
                    : "미리보기를 수정한 뒤 고객을 등록합니다."}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-lg border px-3 text-sm text-gray-600"
              >
                닫기
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {step === "paste" && (
                <form action={analyzeAction} className="space-y-3">
                  <textarea
                    name="raw_text"
                    required
                    rows={14}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="LX하우시스 고객상담실, 홈페이지, 문자, 카카오톡 상담문을 그대로 붙여 넣으세요."
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm leading-relaxed"
                    autoComplete="off"
                  />
                  {analyzeState.error && (
                    <p className="text-sm text-red-600">{analyzeState.error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={analyzing || !rawText.trim()}
                    className="min-h-11 w-full rounded-lg bg-navy-800 text-sm font-semibold text-white disabled:opacity-75"
                  >
                    {analyzing ? "분석 중…" : "내용 분석"}
                  </button>
                </form>
              )}

              {step === "preview" && (
                <form action={registerAction} className="space-y-4">
                  <input type="hidden" name="raw_text" value={preview.raw_text} />
                  <input type="hidden" name="source_type" value={preview.source_type} />
                  <input
                    type="hidden"
                    name="lead_source_name"
                    value={preview.lead_source_name}
                  />
                  <input type="hidden" name="duplicate_mode" value={dupMode} />
                  <input
                    type="hidden"
                    name="existing_customer_id"
                    value={selectedExisting}
                  />
                  {dupMode === "create" && duplicates && duplicates.length > 0 && (
                    <input type="hidden" name="force_create" value="1" />
                  )}

                  {missing.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      인식하지 못한 항목:{" "}
                      {missing.map((m) => MISSING_LABEL[m]).join(", ")}
                      <span className="mt-1 block text-xs text-red-600/90">
                        빨간색 칸을 직접 보완한 뒤 등록할 수 있습니다.
                      </span>
                    </div>
                  )}

                  {duplicates && duplicates.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-semibold text-amber-900">
                        중복 가능성이 있는 고객이 있습니다
                      </p>
                      <ul className="space-y-2 text-sm text-amber-950">
                        {duplicates.map((d, index) =>
                          d.accessible && d.id ? (
                            <li key={d.id}>
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="radio"
                                  name="dup_pick"
                                  checked={selectedExisting === d.id}
                                  onChange={() => setSelectedExisting(d.id!)}
                                />
                                <span>
                                  {d.name} · {d.phone}
                                  {d.assignee_name
                                    ? ` · 담당 ${d.assignee_name}`
                                    : ""}
                                  {d.status ? ` · ${d.status}` : ""}
                                  {d.address ? ` · ${d.address}` : ""}
                                  <span className="ml-1 text-xs text-amber-800">
                                    ({REASON_LABEL[d.reason]})
                                  </span>
                                </span>
                              </label>
                            </li>
                          ) : (
                            <li
                              key={`blocked-${index}`}
                              className="rounded-lg border border-amber-200/70 bg-white/60 px-3 py-2 text-sm"
                            >
                              이미 등록된 고객입니다. 관리자 또는 담당자에게
                              확인해주세요.
                            </li>
                          ),
                        )}
                      </ul>
                      {duplicates.some((d) => d.accessible && d.id) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setDupMode("view")}
                          className={`rounded-lg px-3 py-1.5 text-xs ${
                            dupMode === "view"
                              ? "bg-navy-800 text-white"
                              : "border bg-white"
                          }`}
                        >
                          기존 고객 보기
                        </button>
                        <button
                          type="button"
                          onClick={() => setDupMode("append")}
                          className={`rounded-lg px-3 py-1.5 text-xs ${
                            dupMode === "append"
                              ? "bg-navy-800 text-white"
                              : "border bg-white"
                          }`}
                        >
                          기존 고객에 상담내용 추가
                        </button>
                        <button
                          type="button"
                          onClick={() => setDupMode("create")}
                          className={`rounded-lg px-3 py-1.5 text-xs ${
                            dupMode === "create"
                              ? "bg-navy-800 text-white"
                              : "border bg-white"
                          }`}
                        >
                          신규 고객으로 별도 등록
                        </button>
                      </div>
                      )}
                      {dupMode === "view" && selectedExisting && (
                        <Link
                          href={`/customers/${selectedExisting}`}
                          className="inline-block text-sm font-medium text-navy-800 underline"
                          onClick={close}
                        >
                          선택한 고객 상세로 이동
                        </Link>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs text-gray-600">
                      고객명 *
                      <input
                        name="name"
                        required
                        value={preview.name}
                        onChange={(e) =>
                          setPreview((p) => ({ ...p, name: e.target.value }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("name"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      연락처 *
                      <input
                        name="phone"
                        required
                        value={preview.phone}
                        onChange={(e) =>
                          setPreview((p) => ({ ...p, phone: e.target.value }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("phone"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600 sm:col-span-2">
                      공사주소
                      <input
                        name="address"
                        value={preview.address}
                        onChange={(e) =>
                          setPreview((p) => ({ ...p, address: e.target.value }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("address"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      유입경로
                      <select
                        name="lead_source_id"
                        value={preview.lead_source_id}
                        onChange={(e) => {
                          const id = e.target.value;
                          const src = leadSources.find((s) => s.id === id);
                          setPreview((p) => ({
                            ...p,
                            lead_source_id: id,
                            lead_source_name: src?.name ?? p.lead_source_name,
                          }));
                        }}
                        className="mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">선택</option>
                        {leadSources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-gray-600">
                      담당자 *
                      {canChangeAssignee ? (
                        <select
                          name="assigned_employee_id"
                          required
                          value={preview.assigned_employee_id}
                          onChange={(e) =>
                            setPreview((p) => ({
                              ...p,
                              assigned_employee_id: e.target.value,
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
                        >
                          <option value="">담당자 선택</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {formatEmployeeOptionLabel(e)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <input
                            type="hidden"
                            name="assigned_employee_id"
                            value={preview.assigned_employee_id}
                          />
                          <div className="mt-1 min-h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-slate-900">
                            {employees.find(
                              (e) => e.id === preview.assigned_employee_id,
                            )
                              ? formatEmployeeOptionLabel(
                                  employees.find(
                                    (e) =>
                                      e.id === preview.assigned_employee_id,
                                  )!,
                                )
                              : "본인 담당"}
                          </div>
                        </>
                      )}
                    </label>
                    <label className="text-xs text-gray-600">
                      채널
                      <input
                        name="source_channel"
                        value={preview.source_channel}
                        onChange={(e) =>
                          setPreview((p) => ({
                            ...p,
                            source_channel: e.target.value,
                          }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("source_channel"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      차수
                      <input
                        name="source_round"
                        value={preview.source_round}
                        onChange={(e) =>
                          setPreview((p) => ({
                            ...p,
                            source_round: e.target.value,
                          }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("source_round"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      주문번호
                      <input
                        name="source_order_no"
                        value={preview.source_order_no}
                        onChange={(e) =>
                          setPreview((p) => ({
                            ...p,
                            source_order_no: e.target.value,
                          }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("source_order_no"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      상담 희망시기
                      <input
                        name="desired_timing"
                        value={preview.desired_timing}
                        onChange={(e) =>
                          setPreview((p) => ({
                            ...p,
                            desired_timing: e.target.value,
                          }))
                        }
                        className={`mt-1 ${fieldClass(isMissing("desired_timing"))}`}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      상담상태
                      <select
                        name="status"
                        value={preview.status}
                        onChange={(e) =>
                          setPreview((p) => ({
                            ...p,
                            status: e.target.value as CustomerStatus,
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        {CUSTOMER_FORM_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-gray-600">
                      해피콜 필요 여부
                      <select
                        name="happy_call_required"
                        value={preview.happy_call_required ? "true" : "false"}
                        onChange={(e) =>
                          setPreview((p) => ({
                            ...p,
                            happy_call_required: e.target.value === "true",
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="true">필요</option>
                        <option value="false">불필요</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <p
                      className={`mb-2 text-xs font-medium ${
                        isMissing("interest_items")
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      관심 공종
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {INTEREST_ITEMS.map((item) => {
                        const selected = preview.interest_items.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleInterest(item)}
                            className={`min-h-11 rounded-full px-3 py-2 text-xs font-medium ${
                              selected
                                ? "bg-navy-800 text-gold-400"
                                : "bg-gray-50 text-gray-600 ring-1 ring-gray-200"
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                    {preview.interest_items.map((item) => (
                      <input
                        key={item}
                        type="hidden"
                        name="interest_item"
                        value={item}
                      />
                    ))}
                  </div>

                  <label className="block text-xs text-gray-600">
                    특이사항
                    <textarea
                      name="special_notes"
                      rows={2}
                      value={preview.special_notes}
                      onChange={(e) =>
                        setPreview((p) => ({
                          ...p,
                          special_notes: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    메모
                    <textarea
                      name="event_memo"
                      rows={2}
                      value={preview.event_memo}
                      onChange={(e) =>
                        setPreview((p) => ({
                          ...p,
                          event_memo: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    외부문의 원문 / 상담메모
                    <textarea
                      name="consultation_notes"
                      rows={4}
                      value={preview.consultation_notes}
                      onChange={(e) =>
                        setPreview((p) => ({
                          ...p,
                          consultation_notes: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </label>

                  {registerState.error && (
                    <p className="text-sm text-red-600">{registerState.error}</p>
                  )}

                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <button
                      type="button"
                      onClick={() => setStep("paste")}
                      className="min-h-11 rounded-lg border px-4 text-sm"
                    >
                      다시 분석
                    </button>
                    <button
                      type="submit"
                      disabled={
                        registering ||
                        (dupMode !== "create" && !selectedExisting) ||
                        (dupMode === "create" && !preview.assigned_employee_id)
                      }
                      className="min-h-11 flex-1 rounded-lg bg-navy-800 px-4 text-sm font-semibold text-white disabled:opacity-75"
                    >
                      {registering
                        ? "처리 중…"
                        : dupMode === "view"
                          ? "기존 고객 보기"
                          : dupMode === "append"
                            ? "상담내용 추가"
                            : "고객 등록"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
