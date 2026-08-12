import Link from "next/link";

const ITEMS = [
  { href: "/dashboard", label: "경영 홈", key: "home" },
  { href: "/dashboard/sales", label: "매출·경영", key: "sales" },
  { href: "/dashboard/customers", label: "고객·영업", key: "customers" },
  { href: "/dashboard/marketing", label: "마케팅", key: "marketing" },
] as const;

export default function AdminDashboardNav({
  active,
}: {
  active: (typeof ITEMS)[number]["key"];
}) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-black transition ${
              selected
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
