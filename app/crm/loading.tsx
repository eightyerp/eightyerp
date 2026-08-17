export default function CrmLoading() {
  return (
    <div className="space-y-4" aria-label="CRM 화면 불러오는 중">
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-20 rounded bg-slate-200" />
        <div className="h-7 w-40 rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
