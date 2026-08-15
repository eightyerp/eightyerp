export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5 animate-pulse">
        <div className="h-28 rounded-3xl bg-slate-200" />
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="h-64 rounded-3xl bg-slate-200" />
          <div className="h-64 rounded-3xl bg-slate-200" />
          <div className="h-64 rounded-3xl bg-slate-200" />
        </div>
        <div className="h-40 rounded-3xl bg-slate-200" />
      </div>
    </main>
  );
}
