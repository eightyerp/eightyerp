import type { CompanyPnlSummary } from "@/lib/crm/company-pnl";

const COMMON_CANDIDATES = [
  ["대표급여", "회사공통 판관비", "특정 사업부 매출을 만들기 위한 직접원가가 아니라 경영 본사비"],
  ["경영팀 급여·4대보험·퇴직연금", "회사공통 판관비", "사업부 직원 인건비와 경영지원 인건비를 분리"],
  ["사무실 임차료", "회사공통 판관비", "창호 전용 사무실이 아닌 본사 사용분"],
  ["공통 전산·ERP·회계·노무·법무", "회사공통 판관비", "회사 전체 운영을 위한 관리비"],
  ["회사 전체 광고·브랜드 제작", "회사공통 판관비", "창호/인테리어 전용 광고는 각 사업부에 유지"],
  ["공통 차량·법인카드", "회사공통 또는 사용처별", "차량·카드 사용내역을 사업부/공통으로 세분화"],
] as const;

function compactMoney(value: number) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 100_000_000) {
    return `${sign}${(absolute / 100_000_000)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1")}억`;
  }
  if (absolute >= 10_000) return `${sign}${Math.round(absolute / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}원`;
}

export default function CommonCostReclassPreview({ pnl }: { pnl: CompanyPnlSummary }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-sm">
      <div className="border-b border-orange-200 bg-orange-50 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-800">COMMON COST RECLASS · PREVIEW</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">창호비용에 섞인 본사성 비용을 회사공통으로 분리</h2>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
          현재 손익 DB에는 사업부별 판관비 합계만 있어 세부계정을 임의로 재배분하지 않습니다. 원본 손익의 세부계정을 이관한 뒤 아래 기준으로 재분류하고, 변경 전·후 창호·회사 손익을 비교하는 구조로 전환합니다.
        </p>
      </div>

      <div className="grid gap-px bg-slate-100 md:grid-cols-3">
        <Metric label="현재 창호 판관비 블록" value={compactMoney(pnl.windowSgaExpense)} note="본사성 비용 혼재 가능" />
        <Metric label="현재 인테리어 판관비" value={compactMoney(pnl.interiorSgaExpense)} note="인테리어 전용비 기준" />
        <Metric label="현재 별도 회사공통비" value={compactMoney(pnl.commonSgaExpense)} note="세부계정 재분류 전" warn={pnl.commonSgaExpense === 0} />
      </div>

      <div className="p-5 sm:p-6">
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black text-slate-600">
              <tr>
                <th className="px-4 py-3">비용 후보</th>
                <th className="px-4 py-3">권장 분류</th>
                <th className="px-4 py-3">판단 기준</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMMON_CANDIDATES.map(([label, category, reason]) => (
                <tr key={label} className="bg-white">
                  <td className="px-4 py-3 font-black text-slate-950">{label}</td>
                  <td className="px-4 py-3 font-black text-orange-800">{category}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Step n="1" title="세부계정 이관" text="원본 Excel의 급여·임차료·광고·차량·법인카드 등을 월별 line item으로 가져옵니다." />
          <Step n="2" title="재분류 Preview" text="원본 분류를 보존한 채 창호→회사공통 조정액과 사업부 손익 변화를 계산합니다." />
          <Step n="3" title="대표 승인 후 공식화" text="승인된 조정만 공식 손익 View에 반영하고 원본 Excel 값은 이력으로 유지합니다." />
        </div>

        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
          회사공통비는 직원 예상 정산마진에서 차감하지 않습니다. 또한 참고용 가배분을 사용할 경우에도 반드시 ‘참고용 가배분이며 공식 사업부 손익이 아닙니다’라고 표시합니다.
        </p>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  note,
  warn = false,
}: {
  label: string;
  value: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? "bg-amber-50 p-5" : "bg-white p-5"}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={warn ? "mt-1 text-2xl font-black text-amber-900" : "mt-1 text-2xl font-black text-slate-950"}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-black text-orange-700">STEP {n}</p>
      <p className="mt-1 font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{text}</p>
    </div>
  );
}
