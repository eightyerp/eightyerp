import CreateSiteButton from "@/components/customers/CreateSiteButton";
import ContractTransitionPanel from "@/components/quotes/ContractTransitionPanel";
import type { Employee } from "@/types/database";

export const dynamic = "force-dynamic";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const QUOTE_ID = "44444444-4444-4444-8444-444444444444";

const employees = [
  {
    id: EMPLOYEE_ID,
    name: "홍길동",
    title: "팀장",
    teams: null,
  },
] as unknown as Employee[];

const project = {
  id: PROJECT_ID,
  name: "중계 현대1차 32평",
  address: "서울 노원구 중계동",
  status: "준비",
  assigned_employee_id: EMPLOYEE_ID,
};

export default function WindowFlowQaPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-xs font-semibold text-slate-500">EIGHTY ERP · QA ONLY</p>
          <h1 className="mt-1 text-2xl font-bold">창호 업무 생명주기 UI 검증</h1>
        </header>

        <section className="dashboard-card p-5" id="precontract-site">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-violet-700">계약 전 고객</p>
              <h2 className="mt-1 text-lg font-bold">중계 현대1차 상담 고객</h2>
              <p className="mt-1 text-sm text-slate-600">
                점검과 Window Lab 상담 전에 같은 project_id를 먼저 만드는 흐름입니다.
              </p>
            </div>
            <CreateSiteButton
              customerId={CUSTOMER_ID}
              customerName="김창호"
              customerAddress="서울 노원구 중계동"
              customerStatus="상담중"
              defaultAssigneeId={EMPLOYEE_ID}
              employees={employees}
              existingProjectId={null}
              isAdmin={false}
              currentEmployeeId={EMPLOYEE_ID}
              variant="panel"
            />
          </div>
        </section>

        <section id="transition-existing">
          <ContractTransitionPanel
            quoteId={QUOTE_ID}
            customerId={CUSTOMER_ID}
            quoteStatus="발송완료"
            customerName="김창호"
            customerAddress="서울 노원구 중계동"
            quoteProjectId={PROJECT_ID}
            projects={[project]}
          />
        </section>

        <section id="transition-create">
          <ContractTransitionPanel
            quoteId="55555555-5555-4555-8555-555555555555"
            customerId="66666666-6666-4666-8666-666666666666"
            quoteStatus="발송완료"
            customerName="박신규"
            customerAddress="서울 영등포구"
            quoteProjectId={null}
            projects={[]}
          />
        </section>

        <section id="transition-blocked">
          <ContractTransitionPanel
            quoteId="77777777-7777-4777-8777-777777777777"
            customerId="88888888-8888-4888-8888-888888888888"
            quoteStatus="작성중"
            customerName="이작성"
            customerAddress="서울 구로구"
            quoteProjectId={PROJECT_ID}
            projects={[project]}
          />
        </section>
      </div>
    </main>
  );
}
