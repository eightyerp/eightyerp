import { quickRegisterButtons } from "@/lib/sample-data";

export default function QuickRegister() {
  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">빠른 등록</h3>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {quickRegisterButtons.map((label) => (
          <button
            key={label}
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:border-gold-500 hover:bg-gold-500/5 hover:text-navy-800"
          >
            + {label}
          </button>
        ))}
      </div>
    </div>
  );
}
