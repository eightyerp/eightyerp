import { siteProgress } from "@/lib/sample-data";

const statusColor: Record<string, string> = {
  시공중: "bg-sky-100 text-sky-900",
  자재발주: "bg-amber-100 text-amber-900",
  준공검수: "bg-green-100 text-green-700",
  설계확정: "bg-purple-100 text-purple-700",
};

export default function SiteProgress() {
  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">진행 현장 현황</h3>

      <div className="mt-4 space-y-4">
        {siteProgress.map((site) => (
          <div key={site.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{site.name}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[site.status] ?? "bg-slate-100 text-slate-900"}`}
              >
                {site.status}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gold-500 transition-all"
                  style={{ width: `${site.progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">
                {site.progress}%
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{site.manager}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
