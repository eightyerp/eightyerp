"use client";

import { useState } from "react";
import { completeCustomerScheduleAction } from "@/app/actions/schedules";
import { CUSTOMER_FORM_STATUSES } from "@/lib/crm/constants";
import type { CustomerSchedule } from "@/types/database";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

type Props = {
  row: CustomerSchedule;
  onClose: () => void;
  onDone: (message: string) => void;
};

export default function CompleteScheduleModal({ row, onClose, onDone }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeStatus, setChangeStatus] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    if (!changeStatus) {
      formData.delete("update_customer_status");
    }
    const result = await completeCustomerScheduleAction(formData);
    setPending(false);
    if (!result.success) {
      setError(result.error ?? "완료 처리에 실패했습니다.");
      return;
    }
    onDone(result.message ?? "일정이 완료 처리되었습니다.");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-navy-900">일정 완료 처리</h3>
          <button type="button" onClick={onClose} className="text-sm text-slate-600">
            닫기
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {row.customers?.name ?? "고객"} · {row.title} · {row.schedule_type}
        </p>

        <form action={handleSubmit} className="mt-4 space-y-3">
          <input type="hidden" name="schedule_id" value={row.id} />
          <input type="hidden" name="customer_id" value={row.customer_id} />

          <label className="block text-xs text-gray-600">
            상담 결과 *
            <textarea
              name="result_note"
              required
              rows={3}
              placeholder="상담 내용과 결과를 입력해 주세요."
              className={`${inputClass} mt-1 resize-y`}
            />
          </label>

          <label className="block text-xs text-gray-600">
            고객 반응
            <textarea
              name="customer_reaction"
              rows={2}
              placeholder="고객 반응·분위기"
              className={`${inputClass} mt-1 resize-y`}
            />
          </label>

          <label className="block text-xs text-gray-600">
            다음 조치
            <textarea
              name="next_action"
              rows={2}
              placeholder="후속 조치 내용"
              className={`${inputClass} mt-1 resize-y`}
            />
          </label>

          <label className="block text-xs text-gray-600">
            다음 연락일
            <input
              type="datetime-local"
              name="next_contact_at"
              className={`${inputClass} mt-1`}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-900">
            <input
              type="checkbox"
              checked={changeStatus}
              onChange={(e) => setChangeStatus(e.target.checked)}
            />
            고객 상담상태도 변경
          </label>

          {changeStatus && (
            <label className="block text-xs text-gray-600">
              변경할 상담상태
              <select
                name="update_customer_status"
                defaultValue={row.customers?.status ?? ""}
                className={`${inputClass} mt-1`}
              >
                <option value="">선택</option>
                {CUSTOMER_FORM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-75"
            >
              {pending ? "저장 중..." : "완료 처리"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
