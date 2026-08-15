import type { DashboardEmployeeSales } from "@/lib/crm/dashboard-settlement";
import type {
  DashboardMonthlySalesAnalytics,
  DashboardMonthlySalesPoint,
} from "@/lib/crm/dashboard-monthly-sales";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1")}억`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  }
  return amount.toLocaleString("ko-KR");
}

function share(total: number, value: number) {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

type Tone = "window" | "interior";

export default function SalesAnalyticsPanel({
  analytics,
  employeeSales,
}: {
  analytics: DashboardMonthlySalesAnalytics;
  employeeSales: DashboardEmployeeSales[];
}) {
  const windowRows = employeeSales.filter(
    (row) => row.businessUnit === "window" || row.businessUnit === "shared",
  );
  const interiorRows = employeeSales.filter(
    (row) => row.businessUnit === "interior",
  );
  const windowTotal = windowRows.reduce(
    (sum, row) => sum + Number(row.revenueAmount || 0),
    0,
  );
  const interiorTotal = interiorRows.reduce(
    (sum, row) => sum + Number(row.revenueAmount || 0),
    0,
  );

  return (
    <section className="space-y-4">
      <MonthlySalesCard
        title="창호 월별 매출 추이"
        description="2025년과 2026년 창호 매출을 같은 월 기준으로 비교합니다."
        points={analytics.windowMonthly}
        latest2026Month={analytics.latest2026WindowMonth}
        tone="window"
      />

      <MonthlySalesCard
        title="인테리어 월별 매출 추이"
        description="업로드한 현장별 마진 정산자료를 기준으로 2025년과 2026년 인테리어 매출을 비교합니다."
        points={analytics.interiorMonthly}
        latest2026Month={analytics.latest2026InteriorMonth}
        tone="interior"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SharePanel
          title="창호팀 매출 점유율"
          total={windowTotal}
          rows={windowRows}
          tone="window"
        />
        <SharePanel
          title="인테리어팀 매출 점유율"
          total={interiorTotal}
          rows={interiorRows}
          tone="interior"
        />
      </div>
    </section>
  );
}

function MonthlySalesCard({
  title,
  description,
  points,
  latest2026Month,
  tone,
}: {
  title: string;
  description: string;
  points: DashboardMonthlySalesPoint[];
  latest2026Month: number | null;
  tone: Tone;
}) {
  const isWindow = tone === "window";

  return (
    <div
      className={`rounded-3xl border bg-white p-5 shadow-sm ${
        isWindow ? "border-sky-200" : "border-violet-200"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className={`text-xs font-black uppercase tracking-[0.14em] ${
              isWindow ? "text-sky-700" : "text-violet-700"
            }`}
          >
            MONTHLY SALES
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {description} 2026년 미입력 월은 0원이 아니라 빈칸으로 표시합니다.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
            2025
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-sm ${
                isWindow ? "bg-sky-500" : "bg-violet-500"
              }`}
            />
            2026
          </span>
        </div>
      </div>

      <MonthlyBars
        points={points}
        latest2026Month={latest2026Month}
        tone={tone}
      />
    </div>
  );
}

function MonthlyBars({
  points,
  latest2026Month,
  tone,
}: {
  points: DashboardMonthlySalesPoint[];
  latest2026Month: number | null;
  tone: Tone;
}) {
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [
      point.revenue2025,
      point.revenue2026 ?? 0,
    ]),
  );
  const currentBarClass = tone === "window" ? "bg-sky-500" : "bg-violet-500";

  return (
    <div className="mt-5">
      <div className="grid h-56 grid-cols-12 gap-1.5 border-b border-slate-200 px-1 sm:gap-2">
        {points.map((point) => {
          const height2025 =
            point.revenue2025 > 0
              ? Math.max(2, (point.revenue2025 / maxValue) * 100)
              : 0;
          const height2026 =
            point.revenue2026 == null || point.revenue2026 <= 0
              ? 0
              : Math.max(2, (point.revenue2026 / maxValue) * 100);

          return (
            <div key={point.month} className="flex min-w-0 flex-col justify-end">
              <div className="flex h-48 items-end justify-center gap-0.5 sm:gap-1">
                {point.revenue2025 > 0 ? (
                  <div
                    className="w-2.5 rounded-t bg-slate-300 sm:w-4"
                    style={{ height: `${height2025}%` }}
                    title={`2025년 ${point.month}월 ${point.revenue2025.toLocaleString("ko-KR")}원`}
                  />
                ) : (
                  <div
                    className="w-2.5 sm:w-4"
                    title={`2025년 ${point.month}월 0원`}
                  />
                )}

                {point.revenue2026 != null ? (
                  point.revenue2026 > 0 ? (
                    <div
                      className={`w-2.5 rounded-t sm:w-4 ${currentBarClass}`}
                      style={{ height: `${height2026}%` }}
                      title={`2026년 ${point.month}월 ${point.revenue2026.toLocaleString("ko-KR")}원`}
                    />
                  ) : (
                    <div
                      className="w-2.5 sm:w-4"
                      title={`2026년 ${point.month}월 0원`}
                    />
                  )
                ) : (
                  <div
                    className="w-2.5 sm:w-4"
                    title={`2026년 ${point.month}월 미입력`}
                  />
                )}
              </div>
              <div className="mt-2 text-center text-[10px] font-bold text-slate-500 sm:text-xs">
                {point.month}월
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Insight label="2026 최고 월" value={peakMonthLabel(points)} />
        <Insight
          label="2026 입력 범위"
          value={latest2026Month ? `1~${latest2026Month}월` : "미입력"}
        />
        <Insight
          label="전년 동기간 매출"
          value={samePeriodGrowthLabel(points, latest2026Month)}
        />
      </div>
    </div>
  );
}

function peakMonthLabel(points: DashboardMonthlySalesPoint[]) {
  const available = points.filter((point) => point.revenue2026 != null);
  if (available.length === 0) return "-";
  const peak = [...available].sort(
    (a, b) => Number(b.revenue2026 ?? 0) - Number(a.revenue2026 ?? 0),
  )[0];
  return `${peak.month}월 · ${compactMoney(Number(peak.revenue2026 ?? 0))}`;
}

function samePeriodGrowthLabel(
  points: DashboardMonthlySalesPoint[],
  latest2026Month: number | null,
) {
  if (!latest2026Month) return "-";
  const comparable = points.filter((point) => point.month <= latest2026Month);
  const prior = comparable.reduce(
    (sum, point) => sum + Number(point.revenue2025 || 0),
    0,
  );
  const current = comparable.reduce(
    (sum, point) => sum + Number(point.revenue2026 || 0),
    0,
  );
  if (prior <= 0) return current > 0 ? "신규 실적" : "-";
  const growth = ((current - prior) / prior) * 100;
  return `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`;
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function SharePanel({
  title,
  total,
  rows,
  tone,
}: {
  title: string;
  total: number;
  rows: DashboardEmployeeSales[];
  tone: Tone;
}) {
  const sorted = [...rows].sort((a, b) => b.revenueAmount - a.revenueAmount);
  const isWindow = tone === "window";

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`border-b px-5 py-4 ${
          isWindow
            ? "border-sky-100 bg-sky-50/70"
            : "border-violet-100 bg-violet-50/70"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-950">{title}</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              사업부 전체 매출 {compactMoney(total)} 기준
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
              isWindow
                ? "bg-sky-100 text-sky-800"
                : "bg-violet-100 text-violet-800"
            }`}
          >
            {sorted.filter((row) => row.employeeId).length}명
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {sorted.map((row, index) => {
          const pct = share(total, Number(row.revenueAmount || 0));
          return (
            <div
              key={`${row.businessUnit}:${row.employeeId ?? "shared"}:${row.label}`}
              className="px-5 py-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-600">
                      {row.employeeId ? index + 1 : "공"}
                    </span>
                    <p className="truncate text-sm font-black text-slate-950">
                      {row.label}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    매출 {compactMoney(row.revenueAmount)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-black ${
                      isWindow ? "text-sky-700" : "text-violet-700"
                    }`}
                  >
                    {pct.toFixed(1)}%
                  </p>
                  <p className="text-[10px] font-bold text-slate-400">점유율</p>
                </div>
              </div>
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    isWindow ? "bg-sky-500" : "bg-violet-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
