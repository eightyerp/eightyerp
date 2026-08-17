import Link from "next/link";

const LINKS = [
  {
    href: "/crm/install",
    title: "EIGHTY CRM 설치",
    description: "Android·iPhone 홈 화면에 CRM을 앱처럼 설치하는 방법을 확인합니다.",
  },
  {
    href: "/quotes",
    title: "ERP 상세 견적",
    description: "복잡한 견적 작성·수정이 필요할 때만 ERP 견적관리로 이동합니다.",
  },
  {
    href: "/dashboard",
    title: "ERP 열기",
    description: "회계·정산·관리자 업무가 필요할 때 전체 ERP로 이동합니다.",
  },
] as const;

export default function CrmMorePage() {
  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-semibold text-slate-500">필요할 때만</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">더보기</h1>
        <p className="mt-1 text-sm text-slate-500">직원 영업에 직접 필요하지 않은 기능은 CRM에서 분리합니다.</p>
      </section>

      <section className="space-y-3">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
              <span className="shrink-0 text-lg font-semibold text-slate-300">›</span>
            </div>
          </Link>
        ))}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xs leading-5 text-slate-500">
        CRM은 고객·연락·상담·다음 행동·일정·견적 확인처럼 현장에서 빠르게 처리할 업무만 유지합니다. 광고분석·경영분석·회계·정산은 ERP에서 처리합니다.
      </div>
    </div>
  );
}
