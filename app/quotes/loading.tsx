import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function QuotesLoading() {
  return (
    <DashboardLayout>
      <div className="space-y-6" aria-busy="true" aria-label="견적 목록 로딩 중">
        <div className="space-y-2">
          <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-[420px] animate-pulse rounded-xl bg-slate-100" />
      </div>
    </DashboardLayout>
  );
}
