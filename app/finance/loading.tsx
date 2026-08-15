export default function FinanceLoading() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5 animate-pulse">
        <div className="h-24 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-36 rounded-2xl bg-slate-200" />
          <div className="h-36 rounded-2xl bg-slate-200" />
          <div className="h-36 rounded-2xl bg-slate-200" />
        </div>
        <div className="h-80 rounded-2xl bg-slate-200" />
      </div>
    </main>
  );
}
