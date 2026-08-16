import Link from "next/link";

const STEPS = [
  {
    title: "Android · Chrome",
    steps: [
      "EIGHTY CRM을 Chrome에서 엽니다.",
      "오른쪽 위 ⋮ 메뉴를 누릅니다.",
      "앱 설치 또는 홈 화면에 추가를 선택합니다.",
      "홈 화면의 EIGHTY CRM 아이콘으로 실행합니다.",
    ],
  },
  {
    title: "iPhone · Safari",
    steps: [
      "EIGHTY CRM을 Safari에서 엽니다.",
      "하단 공유 버튼을 누릅니다.",
      "홈 화면에 추가를 선택합니다.",
      "추가 후 홈 화면의 EIGHTY CRM 아이콘으로 실행합니다.",
    ],
  },
] as const;

export default function CrmInstallPage() {
  return (
    <div className="space-y-5">
      <section>
        <Link href="/crm/more" className="text-xs font-bold text-slate-500">
          ← 더보기
        </Link>
        <p className="mt-4 text-xs font-semibold text-slate-500">직원 테스트 준비</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">EIGHTY CRM 설치</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          휴대폰 홈 화면에 추가하면 브라우저 주소창 없이 앱처럼 빠르게 실행할 수 있습니다.
        </p>
      </section>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-black text-emerald-900">설치 후 확인</p>
        <p className="mt-1 text-xs leading-5 text-emerald-800">
          홈 · 고객 · 일정 · 견적 · 더보기 하단 메뉴가 보이고, 다시 로그인하지 않아도 CRM이 정상 실행되는지 확인합니다.
        </p>
      </div>

      <section className="space-y-3">
        {STEPS.map((guide) => (
          <article key={guide.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-950">{guide.title}</h2>
            <ol className="mt-3 space-y-3">
              {guide.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-black text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-950">직원 테스트 체크</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
          <div className="rounded-xl bg-slate-50 px-3 py-3">고객 검색</div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">전화 연결</div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">상담기록</div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">다음 연락</div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">일정 확인</div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">견적 조회</div>
        </div>
      </section>
    </div>
  );
}
