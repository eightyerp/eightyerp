"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cockpitApproveAndPayExpenseAction,
  cockpitApproveExpenseAction,
  cockpitMarkPaidAction,
  cockpitRejectExpenseAction,
} from "@/app/actions/expense-admin-cockpit";
import {
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_WORK_TRADE_LABELS,
  type ExpenseRequestRecord,
} from "@/lib/crm/expense-shared";

function money(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function dateText(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function evidenceCount(row: ExpenseRequestRecord) {
  return row.expense_documents?.length ?? 0;
}

function requester(row: ExpenseRequestRecord) {
  if (!row.requested_employee) return "관리자";
  return [row.requested_employee.name, row.requested_employee.title]
    .filter(Boolean)
    .join(" ");
}

function projectName(row: ExpenseRequestRecord) {
  return row.projects?.name ?? "현장";
}

function vendorName(row: ExpenseRequestRecord) {
  return row.vendor_name_snapshot || row.vendors?.name || "거래처 미지정";
}

export function AdminExpenseWorkCockpit({
  requests,
}: {
  requests: ExpenseRequestRecord[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const pending = requests.filter((row) => row.status === "pending");
  const approved = requests.filter((row) => row.status === "approved");
  const postSettlementPending = pending.filter((row) => row.is_post_settlement);
  const normalPending = pending.filter((row) => !row.is_post_settlement);
  const missingEvidence = requests.filter(
    (row) =>
      !["cancelled", "rejected"].includes(row.status) && evidenceCount(row) === 0,
  );

  // 두 개의 reduce는 렌더 비용이 작고, 매 렌더 새 배열인 pending/approved를
  // useMemo 의존성으로 잡는 것보다 React Compiler와 호환되는 단순 계산이 안전하다.
  const amounts = {
    pending: pending.reduce((sum, row) => sum + Number(row.total_amount), 0),
    approved: approved.reduce((sum, row) => sum + Number(row.total_amount), 0),
  };

  function run(action: () => Promise<{ success: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message ?? result.error ?? null);
      if (result.success) router.refresh();
    });
  }

  function reject(row: ExpenseRequestRecord) {
    const reason = window.prompt(
      `${projectName(row)} · ${money(row.total_amount)} 반려 사유를 입력해 주세요.`,
    );
    if (reason?.trim()) {
      run(() => cockpitRejectExpenseAction(row.id, reason));
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-950 p-5 text-white shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">
            관리자 업무함
          </p>
          <h2 className="mt-1 text-xl font-black">오늘 처리할 지출</h2>
          <p className="mt-1 text-sm font-semibold text-slate-300">
            승인·지급·사후지출·증빙누락을 여기서 먼저 확인하세요.
          </p>
        </div>
        <a
          href="#expense-admin-details"
          className="w-fit rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/15"
        >
          상세 관리영역 보기 ↓
        </a>
      </div>

      {message ? (
        <div className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CockpitMetric
          label="승인대기"
          count={pending.length}
          sub={money(amounts.pending)}
          urgent={pending.length > 0}
        />
        <CockpitMetric
          label="지급대기"
          count={approved.length}
          sub={money(amounts.approved)}
          urgent={approved.length > 0}
        />
        <CockpitMetric
          label="사후지출 검토"
          count={postSettlementPending.length}
          sub="정산완료 현장"
          urgent={postSettlementPending.length > 0}
        />
        <CockpitMetric
          label="증빙 미첨부"
          count={missingEvidence.length}
          sub="추후 보완 필요"
          urgent={false}
        />
      </div>

      {normalPending.length > 0 ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-white">바로 승인할 건</h3>
            <span className="text-xs font-bold text-slate-400">
              최근 {Math.min(normalPending.length, 5)}건
            </span>
          </div>
          <div className="space-y-2">
            {normalPending.slice(0, 5).map((row) => {
              const isCompanyCard = row.payment_method === "company_card";
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">
                          {projectName(row)} · {money(row.total_amount)}
                        </p>
                        <Badge>
                          {EXPENSE_WORK_TRADE_LABELS[row.work_trade] ?? "기타"}
                        </Badge>
                        <Badge>{EXPENSE_PAYMENT_LABELS[row.payment_method]}</Badge>
                        {evidenceCount(row) === 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">
                            증빙 미첨부
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800">
                            증빙 {evidenceCount(row)}건
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-slate-800">
                        {vendorName(row)} · {row.description}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {requester(row)} 신청 · {dateText(row.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            isCompanyCard
                              ? cockpitApproveAndPayExpenseAction(row.id)
                              : cockpitApproveExpenseAction(row.id),
                          )
                        }
                        className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50"
                      >
                        {isCompanyCard ? "승인 + 지급완료" : "승인"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reject(row)}
                        className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-700 disabled:opacity-50"
                      >
                        반려
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {approved.length > 0 ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-white">지급만 남은 건</h3>
            <span className="text-xs font-bold text-slate-400">
              최근 {Math.min(approved.length, 3)}건
            </span>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {approved.slice(0, 3).map((row) => (
              <div key={row.id} className="rounded-xl bg-white p-4 text-slate-950">
                <p className="font-black">
                  {projectName(row)} · {money(row.total_amount)}
                </p>
                <p className="mt-1 truncate text-xs font-bold text-slate-600">
                  {vendorName(row)} · {row.description}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(() => cockpitMarkPaidAction(row.id, row.payment_method))
                  }
                  className="mt-3 min-h-10 w-full rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50"
                >
                  지급완료
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {postSettlementPending.length > 0 ? (
        <div className="mt-5 rounded-xl border border-orange-300/30 bg-orange-400/10 px-4 py-3">
          <p className="font-black text-orange-100">
            정산완료 현장 추가지출 {postSettlementPending.length}건은 단순 승인하면 안 됩니다.
          </p>
          <p className="mt-1 text-sm font-semibold text-orange-100/80">
            회사부담·다음 정산 차감·협력업체 회수·고객 추가청구 중 처리방법을 지정한 뒤 승인해야 합니다.
          </p>
          <a
            href="#expense-admin-details"
            className="mt-3 inline-flex rounded-lg bg-orange-200 px-3 py-2 text-xs font-black text-orange-950"
          >
            사후지출 처리하기 ↓
          </a>
        </div>
      ) : null}
    </section>
  );
}

export function StaffExpenseMyStatus({
  requests,
  employeeId,
}: {
  requests: ExpenseRequestRecord[];
  employeeId: string | null;
}) {
  if (!employeeId) return null;

  const mine = requests
    .filter((row) => row.requested_by_employee_id === employeeId)
    .slice(0, 5);

  if (mine.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950">내 최근 지출요청</h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            제출 후 승인·지급 상태를 여기서 바로 확인할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {mine.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-black text-slate-950">
                {projectName(row)}
              </p>
              <StatusBadge status={row.status} />
            </div>
            <p className="mt-2 text-sm font-black text-slate-950">
              {money(row.total_amount)}
            </p>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-600">
              {EXPENSE_WORK_TRADE_LABELS[row.work_trade] ?? "기타"} · {vendorName(row)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CockpitMetric({
  label,
  count,
  sub,
  urgent,
}: {
  label: string;
  count: number;
  sub: string;
  urgent: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        urgent
          ? "border-amber-300/40 bg-amber-300/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <p className="text-xs font-bold text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{count}건</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">{sub}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: ExpenseRequestRecord["status"] }) {
  const classes =
    status === "pending"
      ? "bg-amber-100 text-amber-800"
      : status === "approved"
        ? "bg-sky-100 text-sky-800"
        : status === "paid"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-200 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${classes}`}>
      {EXPENSE_STATUS_LABELS[status]}
    </span>
  );
}
