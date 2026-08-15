"use client";

import { useState, useTransition } from "react";
import {
  requestManagementAiAnalysis,
  type ManagementAiResult,
} from "@/app/actions/management-ai";
import type {
  ManagementAnalysis,
  ManagementInsightTone,
} from "@/lib/crm/management-analysis";

const TONE_STYLE: Record<ManagementInsightTone, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  risk: "border-red-200 bg-red-50 text-red-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
};

export default function ManagementAiPanel({
  initial,
  compact = false,
}: {
  initial: ManagementAnalysis;
  compact?: boolean;
}) {
  const [result, setResult] = useState<ManagementAiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAnalysis() {
    setError(null);
    startTransition(async () => {
      try {
        const next = await requestManagementAiAnalysis();
        setResult(next);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "AI 분석을 실행하지 못했습니다.",
        );
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-indigo-100 bg-indigo-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
              AI MANAGEMENT BRIEFING
            </p>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-indigo-900 shadow-sm">
              수치 기반 자동분석
            </span>
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            경영 분석 AI
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            목표 속도, 사업부 원가율, 판매관리비와 월별 순이익 변화를 우선순위로 정리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-700 px-4 text-sm font-black text-white transition hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending ? "분석 중..." : "AI 심층분석"}
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
          <p className="text-xs font-black text-indigo-300">오늘의 경영 진단</p>
          <p className="mt-1 text-lg font-black leading-7">{initial.headline}</p>
        </div>

        <div
          className={`mt-4 grid gap-3 ${
            compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {initial.insights.map((insight) => (
            <div
              key={`${insight.title}:${insight.detail}`}
              className={`rounded-2xl border p-4 ${TONE_STYLE[insight.tone]}`}
            >
              <p className="text-sm font-black">{insight.title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 opacity-85">
                {insight.detail}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">우선 실행과제</p>
          <div className="mt-2 space-y-2">
            {initial.actions.map((action, index) => (
              <div key={action} className="flex gap-2 text-sm font-semibold text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                  {index + 1}
                </span>
                <p className="leading-5">{action}</p>
              </div>
            ))}
          </div>
        </div>

        {result ? (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-indigo-950">
                {result.source === "openai" ? "OpenAI 심층분석" : "ERP 자동분석"}
              </p>
              <span className="text-[11px] font-bold text-indigo-700">
                {new Date(result.generatedAt).toLocaleString("ko-KR")}
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">
              {result.text}
            </p>
            {result.source === "rules" ? (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                OpenAI API 키가 연결되지 않았거나 외부 분석이 일시적으로 실패해 ERP 수치 기반 분석을 표시했습니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
          심층분석 버튼을 누른 경우에만 합계 수치가 서버에서 AI 분석으로 전달됩니다. 고객 개인정보와 개별 상담내용은 전송하지 않습니다.
        </p>
      </div>
    </section>
  );
}
