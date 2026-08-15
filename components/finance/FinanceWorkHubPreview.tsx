import Link from "next/link";
import type {
  FinancePriorityItem,
  FinanceV2PreviewBundle,
  ProjectFinancePreview,
} from "@/lib/crm/finance-v2-preview-bundle";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 100_000_000) {
    return `${sign}${(absolute / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1")}억`;
  }
  if (absolute >= 10_000) return `${sign}${Math.round(absolute / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}`;
}

function severityClass(severity: FinancePriorityItem["severity"]) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-950";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

function unitLabel(unit: ProjectFinancePreview["businessUnit"]) {
  if (unit === "window") return "창호";
  if (unit === "interior") return "인테리어";
  return "미분류";
}

export default function FinanceWorkHubPreview({
  bundle,
}: {
  bundle: FinanceV2PreviewBundle;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">
              FINANCE WORK HUB · PREVIEW
            </p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">오늘 처리할 재무업무</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-400">
              단순 건수보다 금액 영향과 위험도를 먼저 보여줍니다. 이 화면은 현재 운영 데이터를 읽기만 하며 승인·수정·이관은 실행하지 않습니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TopMetric label="확정 계약" value={`${bundle.contractCount}건`} />
            <TopMetric label="확정 수금" value={compactMoney(bundle.confirmedCollectionAmount)} />
            <TopMetric label="지출 승인대기" value={`${bundle.pendingExpenseCount}건`} />
            <TopMetric label="증빙 미확인" value={`${bundle.missingEvidenceCount}건`} />
          </div>
        </div>
      </section>

      {bundle.warnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-950">
          {bundle.warnings.join(" · ")}
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">PRIORITY QUEUE</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">금액·위험 우선순위</h2>
          </div>
          <p className="text-xs font-semibold text-slate-500">빨강 → 주황 → 초록 순으로 먼저 처리</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {bundle.priorities.map((item) => (
            <article key={item.key} className={`rounded-2xl border p-4 ${severityClass(item.severity)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{item.label}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 opacity-70">{item.hint}</p>
                </div>
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-black">{item.count}건</span>
              </div>
              <p className="mt-4 text-2xl font-black">{item.amount > 0 ? compactMoney(item.amount) : "-"}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">PROJECT MONEY LINE</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">현장 한 줄 재무상태</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              계약·수금·미수금·승인지출·마진·잠정정산을 한 행으로 연결합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/finance/collections-preview" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50">
              수금 Preview
            </Link>
            <Link href="/finance/payments-preview" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
              지출 Preview
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {bundle.projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm font-semibold text-slate-500">
              ERP 현장이 아직 없습니다.
            </div>
          ) : (
            bundle.projects.map((project) => <ProjectMoneyLine key={project.projectId} project={project} />)
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/dashboard/finance-preview" className="rounded-2xl border border-violet-200 bg-violet-50 p-5 hover:border-violet-300">
          <p className="text-xs font-black text-violet-700">손익 BRIDGE</p>
          <p className="mt-2 text-lg font-black text-slate-950">현장마진 → 직원정산 → 회사귀속마진</p>
        </Link>
        <Link href="/finance/collections-preview" className="rounded-2xl border border-sky-200 bg-sky-50 p-5 hover:border-sky-300">
          <p className="text-xs font-black text-sky-700">COLLECTIONS V2</p>
          <p className="mt-2 text-lg font-black text-slate-950">계약검색·기수금·미수금 Preview</p>
        </Link>
        <Link href="/finance/payments-preview" className="rounded-2xl border border-orange-200 bg-orange-50 p-5 hover:border-orange-300">
          <p className="text-xs font-black text-orange-700">EXPENSE V2</p>
          <p className="mt-2 text-lg font-black text-slate-950">등록·승인·증빙·손익 영향 Preview</p>
        </Link>
      </section>
    </div>
  );
}

function TopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function ProjectMoneyLine({ project }: { project: ProjectFinancePreview }) {
  const marginRate = project.contractAmount > 0 ? (project.contributionMargin / project.contractAmount) * 100 : null;
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-950">{project.projectName}</p>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-600">{unitLabel(project.businessUnit)}</span>
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{project.address || "주소 미등록"}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-3 xl:grid-cols-6">
          <Mini label="계약" value={project.contractAmount > 0 ? compactMoney(project.contractAmount) : "미연결"} />
          <Mini label="수금" value={compactMoney(project.receivedAmount)} />
          <Mini label="미수금" value={compactMoney(project.outstandingAmount)} />
          <Mini label="승인지출" value={compactMoney(project.approvedExpenseAmount)} />
          <Mini label="현장마진" value={project.contractAmount > 0 ? `${compactMoney(project.contributionMargin)}${marginRate !== null ? ` · ${marginRate.toFixed(1)}%` : ""}` : "계약 연결 후"} />
          <Mini label="잠정정산" value={project.provisionalSettlement === null ? "사업부 확정 후" : compactMoney(project.provisionalSettlement)} />
        </div>
      </div>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black text-slate-500">{label}</p>
      <p className="mt-0.5 font-black text-slate-950">{value}</p>
    </div>
  );
}
