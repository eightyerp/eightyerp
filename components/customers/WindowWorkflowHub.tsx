import Link from "next/link";
import type { CustomerConsultLog, ErpQuote, Project } from "@/types/database";

export type WindowInspectionSummary = {
  id: string;
  project_id: string;
  inspection_status: string;
  completed_at: string | null;
  total_windows: number;
  status_counts: Record<string, number>;
  highest_status_level: number | null;
  report_status: string;
  report_reference: string | null;
};

export default function WindowWorkflowHub({
  customerId,
  companyId,
  projects,
  inspections,
  consultLogs,
  quotes,
  selectedProjectId,
}: {
  customerId: string;
  companyId: string | null;
  projects: Project[];
  inspections: WindowInspectionSummary[];
  consultLogs: CustomerConsultLog[];
  quotes: ErpQuote[];
  selectedProjectId: string | null;
}) {
  const project = projects.find((item) => item.id === selectedProjectId) ?? projects[0] ?? null;
  const projectInspections = project ? inspections.filter((item) => item.project_id === project.id) : [];
  const inspection = projectInspections[0] ?? null;
  const consultation = inspection
    ? consultLogs.find((item) => item.source_project_id === project?.id && item.source_inspection_id === inspection.id) ?? null
    : null;
  const quote = inspection
    ? quotes.find((item) => item.project_id === project?.id && item.source_inspection_id === inspection.id && (!consultation || item.source_consultation_id === consultation.id)) ?? null
    : null;
  const checkQuery = new URLSearchParams({ customerId, projectId: project?.id ?? "" });
  if (companyId) checkQuery.set("companyId", companyId);
  const labBase = process.env.NEXT_PUBLIC_WINDOW_LAB_BASE_URL || "https://eighty-window-lab.vercel.app";
  const labQuery = new URLSearchParams({ customerId, projectId: project?.id ?? "" });
  if (inspection) labQuery.set("inspectionId", inspection.id);

  const steps = [
    { title: "1. 현장 점검", status: inspection?.inspection_status === "completed" ? "완료" : inspection ? "진행 중" : "점검 전" },
    { title: "2. Window Lab 상담", status: consultation ? "완료" : "상담 전" },
    { title: "3. ERP 견적", status: quote?.status ?? "미작성" },
  ];

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold text-blue-700">창호 업무 진행</p><h2 className="mt-1 text-lg font-bold text-slate-950">점검 → 상담 → 견적</h2></div>
        {!project && <span className="text-sm text-amber-800">먼저 고객 현장을 등록해 주세요.</span>}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((step) => <div key={step.title} className="rounded-xl border bg-white p-4"><p className="font-semibold text-slate-900">{step.title}</p><p className="mt-1 text-sm text-slate-600">{step.status}</p></div>)}
      </div>
      {projects.length > 1 && <div className="mt-4 flex flex-wrap gap-2" aria-label="업무 현장 선택">
        {projects.map((item) => <Link key={item.id} href={`/customers/${encodeURIComponent(customerId)}?workflowProjectId=${encodeURIComponent(item.id)}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${item.id === project?.id ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{item.name || item.address || "현장"}</Link>)}
      </div>}
      {inspection && <p className="mt-3 text-sm text-slate-700">최근 점검: {inspection.completed_at ? new Date(inspection.completed_at).toLocaleDateString("ko-KR") : "진행 중"} · 창호 {inspection.total_windows}개 · 최고 {inspection.highest_status_level ?? "-"}/5 · 리포트 {inspection.report_status}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {project ? <a href={`eightywindowcheck://inspection/start?${checkQuery}`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">현장 점검 시작</a> : <span className="cursor-not-allowed rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">현장 점검 시작</span>}
        {project ? <a href={`${labBase}/?${labQuery}`} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900" target="_blank" rel="noreferrer">Window Lab 상담 시작</a> : <span className="cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">Window Lab 상담 시작</span>}
        {project && inspection && consultation ? <Link href={`/quotes/new?customerId=${encodeURIComponent(customerId)}&projectId=${encodeURIComponent(project.id)}&consultationId=${encodeURIComponent(consultation.id)}&inspectionId=${encodeURIComponent(inspection.id)}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">ERP 견적 작성</Link> : <span className="cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">ERP 견적 작성</span>}
      </div>
    </section>
  );
}
