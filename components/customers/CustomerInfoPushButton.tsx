"use client";

import { useActionState, useEffect } from "react";
import {
  pushCustomerInfoAction,
  type CustomerPushActionResult,
} from "@/app/actions/customer-push";

const initialState: CustomerPushActionResult = { success: false };

export default function CustomerInfoPushButton({
  customerId,
  assigneeName,
  onNotify,
}: {
  customerId: string;
  assigneeName: string | null;
  onNotify?: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    pushCustomerInfoAction,
    initialState,
  );

  useEffect(() => {
    const message = state.message || state.error;
    if (message) onNotify?.(message);
  }, [state.message, state.error, onNotify]);

  return (
    <form action={action}>
      <input type="hidden" name="customer_id" value={customerId} />
      <button
        type="submit"
        disabled={pending || !assigneeName}
        title={
          assigneeName
            ? `${assigneeName} 담당자에게 고객정보 PUSH`
            : "담당자를 먼저 지정해 주세요."
        }
        className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "PUSH 중..." : "고객정보 PUSH"}
      </button>
    </form>
  );
}
