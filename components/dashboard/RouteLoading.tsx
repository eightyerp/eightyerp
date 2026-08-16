type RouteLoadingProps = {
  label?: string;
};

export default function RouteLoading({
  label = "화면을 불러오는 중입니다...",
}: RouteLoadingProps) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
        <p className="mt-2 text-sm text-slate-500">{label}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
