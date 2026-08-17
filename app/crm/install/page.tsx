import Link from "next/link";

const STEPS = [
  {
    title: "Android · Chrome",
    description: "Play 스토어 설치 없이 Chrome에서 바로 홈 화면 앱으로 설치합니다.",
    steps: [
      "EIGHTY CRM을 Chrome에서 엽니다.",
      "오른쪽 위 ⋮ 메뉴를 누릅니다.",
      "앱 설치 또는 홈 화면에 추가를 선택합니다.",
      "홈 화면의 EIGHTY CRM 아이콘으로 다시 실행합니다.",
      "CRM 알림 화면에서 업무 알림을 켭니다.",
    ],
  },
  {
    title: "iPhone · Safari",
    description: "App Store는 필요 없지만 Safari에서 홈 화면 추가를 한 번 직접 눌러야 합니다.",
    steps: [
      "EIGHTY CRM을 Safari에서 엽니다.",
      "공유 버튼을 누르고 홈 화면에 추가를 선택합니다.",
      "웹 앱으로 열기 옵션이 보이면 켠 상태로 추가합니다.",
      "Safari 탭이 아니라 홈 화면의 EIGHTY CRM 아이콘으로 다시 실행합니다.",
      "설치된 CRM의 알림 화면에서 업무 알림을 켭니다.",
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
          Android와 iPhone 모두 같은 CRM을 사용하되, 각 휴대폰의 공식 홈 화면 설치방식을 사용합니다.
        </p>
      </section>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-black text-emerald-900">설치 후 확인</p>
        <p className="mt-1 text-xs leading-5 text-emerald-800">
          홈 · 고객 · 일정 · 견적 · 더보기 하단 메뉴가 보이고, 다시 로그인하지 않아도 CRM이 정상 실행되는지 확인합니다.
        </p>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-sm font-black text-sky-950">iPhone PUSH 중요</p>
        <p className="mt-1 text-xs leading-5 text-sky-800">
          iPhone은 Safari 탭이 아니라 홈 화면에 설치한 EIGHTY CRM을 실행한 뒤 알림 권한을 켜야 합니다. 설치 전에는 CRM이 먼저 설치방법을 안내합니다.
        </p>
      </div>

      <section className="space-y-3">
        {STEPS.map((guide) => (
          <article key={guide.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-950">{guide.title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{guide.description}</p>
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
          <div className="rounded-xl bg-slate-50 px-3 py-3">앱 재실행</div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">알림 권한</div>
        </div>
      </section>
    </div>
  );
}
