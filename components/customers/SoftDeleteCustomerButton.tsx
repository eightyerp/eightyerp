"use client";

import { useActionState, useState } from "react";
import {
  softDeleteCustomerAction,
  type ActionResult,
} from "@/app/actions/customers";

type SoftDeleteCustomerButtonProps = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  className?: string;
};

const initialState: ActionResult = { success: false };

export default function SoftDeleteCustomerButton({
  customerId,
  customerName,
  customerPhone,
  className = "rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50",
}: SoftDeleteCustomerButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    softDeleteCustomerAction,
    initialState,
  );

  const modalOpen = open || Boolean(state.error);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        삭제
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">고객 삭제 확인</h3>
            <p className="mt-2 text-sm text-gray-600">
              아래 고객을 삭제 고객함으로 이동합니다. (즉시 영구삭제되지 않습니다)
            </p>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p>
                <span className="text-slate-600">고객명</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {customerName}
                </span>
              </p>
              <p className="mt-1">
                <span className="text-slate-600">연락처</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {customerPhone}
                </span>
              </p>
            </div>

            <form action={formAction} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={customerId} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  삭제 사유
                </label>
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="삭제 사유를 입력하세요"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>

              {state.error && (
                <p className="text-sm text-red-600">{state.error}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-75"
                >
                  {pending ? "삭제 중..." : "삭제 고객함으로 이동"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
