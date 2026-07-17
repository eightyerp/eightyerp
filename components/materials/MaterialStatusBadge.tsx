export default function MaterialStatusBadge({
  status,
}: {
  status?: string | null;
}) {
  if (!status) return null;
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
      {status}
    </span>
  );
}
