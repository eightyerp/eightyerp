type PreviewExpense = {
  id: string;
  description: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  category: string;
  workTrade: string;
  taxEvidenceType: string;
  hasDocument: boolean;
  projectName: string | null;
  vendorName: string | null;
};

function compactMoney(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100_000_000) return `${(amount / 100_000_000).toFixed(2).replace(/\.00$/, "")}억`;
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

function recommendCostNature(row: PreviewExpense) {
  if (row.category === "advertising" || row.category === "sga") return "판매관리비";
  if (["materials", "subcontract", "labor", "demolition", "lifting", "freight", "site"].includes(row.category)) {
    return "직접원가";
  }
  return "기타 · 검토필요";
}

function recommendBusinessUnit(row: PreviewExpense) {
  if (row.workTrade === "windows") return "창호";
  if (!row.projectName && ["advertising", "sga"].includes(row.category)) return "회사공통 후보";
  return "미분류 · 현장 사업부 연결 필요";
}

function approvalStatus(status: string) {
  if (status === "pending") return "승인대기";
  if (status === "rejected") return "반려";
  if (status === "cancelled") return "취소";
  return "승인완료";
}

function paymentStatus(row: PreviewExpense) {
  if (row.status === "paid") return "외부비용 지급완료";
  if (["company_card", "personal_card", "cash"].includes(row.paymentMethod)) return "외부비용 이미 지급";
  return "회사 지급 전";
}

function reimbursementStatus(row: PreviewExpense) {
  if (row.paymentMethod === "personal_card" || row.paymentMethod === "cash") {
    return "직원 환급대기 가능";
  }
  return "직원 환급 해당없음";
}

function pnlImpact(row: PreviewExpense) {
  const nature = recommendCostNature(row);
  if (nature === "직접원가") return "승인 시 현장 잠정마진 감소";
  if (nature === "판매관리비") return "승인·분류 후 사업부 영업이익 감소";
  return "분류 확정 후 손익반영";
}

export default function ExpenseV2PreviewBoard({ rows }: { rows: PreviewExpense[] }) {
  const reimbursementRows = rows.filter(
    (row) => row.paymentMethod === "personal_card" || row.paymentMethod === "cash",
  );

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.15em] text-orange-800">EXPENSE V2 PREVIEW</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">직원은 1분 등록 · 관리자는 30초 승인</h1>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
          현재 운영자료를 수정하지 않고 기존 지출을 새 구조로 어떻게 보일지 미리 계산합니다. 승인·지급·증빙·손익상태와 직원 개인 선지급 환급을 서로 분리합니다.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <EntryFlow
          title="현장비"
          tone="sky"
          steps={["현장검색", "사업부 자동추천", "공종", "거래처", "금액·결제", "증빙", "등록"]}
          note="비용성격은 직접원가를 기본 추천합니다. 판단이 불명확하면 미분류로 저장하고 관리자에게 넘깁니다."
        />
        <EntryFlow
          title="회사 운영비"
          tone="violet"
          steps={["창호·인테리어·회사공통", "비용성격", "거래처", "금액·결제", "증빙", "지출일", "등록"]}
          note="대표급여·사무실·공통광고 등 본사성 비용은 회사공통 판관비 후보로 분류합니다."
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="현재 지출" value={`${rows.length}건`} />
        <Kpi label="승인대기" value={`${rows.filter((row) => approvalStatus(row.status) === "승인대기").length}건`} />
        <Kpi label="증빙 보완" value={`${rows.filter((row) => !row.hasDocument || row.taxEvidenceType === "unverified").length}건`} />
        <Kpi label="사업부 미분류" value={`${rows.filter((row) => recommendBusinessUnit(row).startsWith("미분류")).length}건`} warn />
        <Kpi label="개인 선지급 후보" value={`${reimbursementRows.length}건`} warn={reimbursementRows.length > 0} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">관리자 승인카드 Preview</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">금액·사업부·손익 영향이 명확한 일반건은 빠르게 승인하고 위험건만 상세검토합니다.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-bold text-slate-500">현재 지출자료가 없습니다.</div>
          ) : rows.map((row) => {
            const unit = recommendBusinessUnit(row);
            const costNature = recommendCostNature(row);
            const personalAdvance = row.paymentMethod === "personal_card" || row.paymentMethod === "cash";
            const needsReview =
              unit.startsWith("미분류") ||
              !row.hasDocument ||
              row.taxEvidenceType === "unverified" ||
              personalAdvance;

            return (
              <article key={row.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={needsReview ? "rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-900" : "rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-900"}>
                        {needsReview ? "검토 필요" : "빠른 승인 가능"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">{approvalStatus(row.status)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">{paymentStatus(row)}</span>
                      {personalAdvance ? (
                        <span className="rounded-full bg-fuchsia-100 px-2 py-1 text-[11px] font-black text-fuchsia-900">직원 환급 검토</span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 truncate text-base font-black text-slate-950">{row.description}</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {row.projectName ?? "운영비/현장 미연결"} · {row.vendorName ?? "거래처 미등록"}
                    </p>
                  </div>
                  <div className="text-left xl:text-right">
                    <p className="text-2xl font-black text-slate-950">{compactMoney(row.totalAmount)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{row.paymentMethod}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  <State label="사업부 추천" value={unit} warn={unit.startsWith("미분류")} />
                  <State label="비용성격 추천" value={costNature} />
                  <State label="증빙" value={row.hasDocument ? "파일 첨부" : "미첨부"} warn={!row.hasDocument} />
                  <State label="세무증빙" value={row.taxEvidenceType === "unverified" ? "미확인" : row.taxEvidenceType} warn={row.taxEvidenceType === "unverified"} />
                  <State label="직원 환급" value={reimbursementStatus(row)} warn={personalAdvance} />
                  <State label="손익 영향" value={pnlImpact(row)} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white opacity-50">승인 Preview</button>
                  <button type="button" disabled className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700 opacity-50">사업부 변경 Preview</button>
                  <button type="button" disabled className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700 opacity-50">보완요청 Preview</button>
                  {personalAdvance ? (
                    <button type="button" disabled className="rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-4 py-2 text-xs font-black text-fuchsia-800 opacity-60">환급 승인 Preview</button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-fuchsia-200 bg-fuchsia-50 p-5 sm:p-6">
        <p className="text-xs font-black text-fuchsia-700">개인카드·현금 원칙</p>
        <p className="mt-2 text-lg font-black text-slate-950">직원 정산금과 개인 선지급 환급을 섞지 않습니다.</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          개인카드나 직원 현금으로 결제한 비용은 거래처에는 이미 지급됐지만 회사가 직원에게 갚아야 할 금액이 남아 있을 수 있습니다. 따라서 외부비용 지급상태와 직원 환급상태를 별도로 관리합니다.
        </p>
      </section>
    </div>
  );
}

function EntryFlow({
  title,
  tone,
  steps,
  note,
}: {
  title: string;
  tone: "sky" | "violet";
  steps: string[];
  note: string;
}) {
  const toneClass = tone === "sky" ? "border-sky-200 bg-sky-50" : "border-violet-200 bg-violet-50";
  const textClass = tone === "sky" ? "text-sky-800" : "text-violet-800";
  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <p className={`text-xs font-black uppercase tracking-[0.14em] ${textClass}`}>1 MINUTE ENTRY</p>
      <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-1.5">
            <span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800">{step}</span>
            {index < steps.length - 1 ? <span className="text-xs font-black text-slate-400">→</span> : null}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">{note}</p>
    </div>
  );
}

function Kpi({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={warn ? "rounded-2xl border border-amber-200 bg-amber-50 p-4" : "rounded-2xl border border-slate-200 bg-white p-4"}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={warn ? "mt-1 text-xl font-black text-amber-900" : "mt-1 text-xl font-black text-slate-950"}>{value}</p>
    </div>
  );
}

function State({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={warn ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-3" : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"}>
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className={warn ? "mt-1 text-sm font-black text-amber-900" : "mt-1 text-sm font-black text-slate-900"}>{value}</p>
    </div>
  );
}
