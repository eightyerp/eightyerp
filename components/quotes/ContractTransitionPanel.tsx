"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { transitionQuoteToContractAction } from "@/app/actions/quote-contract-transition";
import type { ContractTransitionProjectOption } from "@/lib/crm/quote-contract-transition";

type Props = {
  quoteId: string;
  customerId: string;
  quoteStatus: string;
  customerName: string;
  customerAddress: string | null;
  quoteProjectId: string | null;
  projects: ContractTransitionProjectOption[];
};

export default function ContractTransitionPanel({
  quoteId,
  customerId,
  quoteStatus,
  customerName,
  customerAddress,
  quoteProjectId,
  projects,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [contractId, setContractId] = useState("");
  const [projectId, setProjectId] = useState("");

  const validQuoteProjectId = useMemo(
    () =>
      quoteProjectId && projects.some((project) => project.id === quoteProjectId)
        ? quoteProjectId
        : null,
    [projects, quoteProjectId],
  );
  const initialProjectId = validQuoteProjectId || (projects.length === 1 ? projects[0].id : "");
  const hasExistingProject = projects.length > 0;
  const canTransition = quoteStatus === "발송완료";
  const needsProjectChoice = projects.length > 1 && !validQuoteProjectId;

  function handleSubmit(formData: FormData) {
    if (!canTransition) return;
    const mode = String(formData.get("project_mode") ?? "");
    const selectedProjectId = String(formData.get("project_id") ?? "").trim();
    if (mode === "link" && !selectedProjectId) {
      setError("계약에 연결할 현장을 선택해 주세요.");
      return;
    }

    const projectLabel =
      mode === "link"
        ? projects.find((project) => project.id === selectedProjectId)?.name || "선택 현장"
        : `${customerName} 신규 현장`;
    if (
      !window.confirm(
        `실제 계약으로 전환합니다.\n\n고객: ${customerName}\n현장: ${projectLabel}\n\n계약·현장·실행예산이 연결됩니다. 진행할까요?`,
      )
    ) {
      return;
    }

    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await transitionQuoteToContractAction(formData);
      if (!result.success) {
        setError(result.error || "계약 전환에 실패했습니다.");
        return;
      }
      setContractId(result.contractId || "");
      setProjectId(result.projectId || "");
      setMessage(result.message || "계약 전환이 완료되었습니다.");
      router.refresh();
    });
  }

  return (
    <section className="dashboard-card border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-emerald-700">창호 업무 다음 단계</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">실제 계약 전환</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            견적 상태만 바꾸는 기능이 아닙니다. 계약 전환 시 실제 계약, 현장,
            실행예산이 하나의 업무 흐름으로 연결됩니다. 계약 전에 만든 점검·상담
            현장이 있으면 새 현장을 만들지 않고 그대로 재사용합니다.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs leading-5 text-slate-700">
          <p>
            <span className="font-semibold">현재 견적 상태</span> · {quoteStatus}
          </p>
          <p>
            <span className="font-semibold">현장</span> · {projects.length}건
          </p>
          <p className="mt-1 text-slate-600">
            {canTransition
              ? "고객전송 완료 · 계약 전환 가능"
              : "고객전송을 완료해 ‘발송완료’가 된 뒤 계약 전환할 수 있습니다."}
          </p>
        </div>
      </div>

      {canTransition ? (
        <form action={handleSubmit} className="mt-4 grid gap-3 rounded-xl border border-emerald-200 bg-white p-4 md:grid-cols-2">
          <input type="hidden" name="quote_id" value={quoteId} />
          <input type="hidden" name="customer_id" value={customerId} />
          <input
            type="hidden"
            name="project_mode"
            value={hasExistingProject ? "link" : "create"}
          />

          {hasExistingProject ? (
            <label className="text-xs font-medium text-slate-700 md:col-span-2">
              계약에 사용할 기존 현장
              <select
                name="project_id"
                defaultValue={initialProjectId}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                {needsProjectChoice && <option value="">현장을 선택해 주세요</option>}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.address ? ` · ${project.address}` : ""} · {project.status}
                    {project.id === quoteProjectId ? " · 현재 견적 연결" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-slate-500">
                기존 현장을 재사용하므로 점검·상담·견적 이력이 같은 project_id로 유지됩니다.
              </span>
            </label>
          ) : (
            <>
              <label className="text-xs font-medium text-slate-700">
                새 현장명
                <input
                  name="project_name"
                  defaultValue={customerName}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs font-medium text-slate-700">
                현장주소
                <input
                  name="project_address"
                  defaultValue={customerAddress ?? ""}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-900"
                />
              </label>
            </>
          )}

          <label className="text-xs font-medium text-slate-700">
            계약일 · 선택
            <input
              type="date"
              name="contract_date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-900"
            />
            <span className="mt-1 block font-normal text-slate-500">
              비워두면 시스템 기준 계약일을 사용합니다.
            </span>
          </label>

          <div className="flex items-end md:justify-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60 md:w-auto"
            >
              {pending ? "계약 전환 중…" : "실제 계약으로 전환"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          먼저 고객전송 링크에서 <strong>발송완료</strong> 처리를 해주세요. 발송 전 견적은 계약으로 전환하지 않습니다.
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-100 px-3 py-2 text-sm text-emerald-900">
          <p>{message}</p>
          {(contractId || projectId) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {contractId && (
                <Link href={`/contracts/${contractId}`} className="font-semibold underline">
                  계약 보기
                </Link>
              )}
              {projectId && (
                <Link href={`/projects/${projectId}/schedule`} className="font-semibold underline">
                  현장 보기
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
