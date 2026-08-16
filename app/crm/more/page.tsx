import Link from "next/link";

const LINKS = [
  {
    href: "/crm/install",
    title: "EIGHTY CRM 설치",
    description: "Android·iPhone 홈 화면에 CRM을 앱처럼 설치하는 방법을 확인합니다.",
  },
  {
    href: "/customers/pipeline",
    title: "PC 영업 파이프라인",
    description: "6단계 Kanban 전체 현황을 PC 화면으로 봅니다.",
  },
  {
    href: "/quotes",
    title: "ERP 견적관리",
    description: "상세 견적 작성·수정·발송 업무로 이동합니다.",
  },
  {
    href: "/schedules",
    title: "ERP 전체 일정",
    description: "팀·직원별 전체 일정을 상세 관리합니다.",
  },
  {
    href: "/dashboard",
    title: "ERP 대시보드",
    description: "관리자용 전체 ERP 화면으로 이동합니다.",
  },
] as const;

export default function CrmMorePage() {
  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs font-semibold text-slate-500">필요할 때만</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">더보기</h1>
        <p className="mt-1 text-sm text-slate-500">설치 안내와 자주 쓰지 않는 상세 업무를 CRM 홈에서 분리했습니다.</p>
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
        CRM은 고객·연락·일정·견적처럼 직원이 현장에서 빠르게 처리해야 하는 업무만 유지합니다. 회계·정산·지출결의 등 상세 관리업무는 ERP에서 처리합니다.
      </div>
    </div>
  );
}
