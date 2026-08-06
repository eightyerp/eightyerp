"use client";

import { useState } from "react";

export default function QuickMemo() {
  const [memo, setMemo] = useState("");

  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">빠른 메모</h3>

      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모를 입력하세요..."
        rows={4}
        className="mt-4 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
      />
      <button
        type="button"
        className="mt-3 w-full rounded-lg bg-navy-800 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-700"
      >
        메모 저장
      </button>
    </div>
  );
}
