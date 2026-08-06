import { notifications } from "@/lib/sample-data";

const typeIcon: Record<string, string> = {
  info: "bg-sky-100 text-sky-900",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-emerald-100 text-emerald-900",
};

export default function Notifications() {
  return (
    <div className="dashboard-card p-5">
      <h3 className="dashboard-section-title">알림</h3>

      <div className="mt-4 space-y-3">
        {notifications.map((noti) => (
          <div
            key={noti.message}
            className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${typeIcon[noti.type]}`}
            >
              !
            </span>
            <div>
              <p className="text-sm text-slate-900">{noti.message}</p>
              <p className="mt-0.5 text-xs text-slate-600">{noti.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
