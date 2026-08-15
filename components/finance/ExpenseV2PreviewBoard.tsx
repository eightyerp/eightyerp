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
  return "미분류 · 현장 사업부 연결 필요";
}

function approvalStatus(status: string) {
  if (status === "pending") return "승인대기";
  if (status === "rejected") return "반려";
  if (status === "cancelled") return "취소";
  return "승인완료";
}

function paymentStatus(row: PreviewExpense) {
  if (row.status === "paid") return "지급완료";
  if (["company_card", "personal_card", "cash"].includes(row.paymentMethod)) return "이미 결제 · 회사정산 확인";
  return "미지급";
}

export default function ExpenseV2PreviewBoard({ rows }: { rows: PreviewExpense[] }) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.15em] text-orange-800">EXPENSE V2 PREVIEW</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">지출 승인·지급·증빙·손익상태 분리</h1>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
          현재 운영자료를 수정하지 않고 기존 지출을 새 구조로 어떻게 보일지 미리 계산합니다. 사업부가 확정되지 않은 현장비는 임의로 인테리어에 넣지 않고 미분류 상태로 둡니다.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="현재 지출" value={`${rows.length}건`} />
        <Kpi label="승인대기" value={`${rows.filter((row) => approvalStatus(row.status) === "승인대기").length}건`} />
        <Kpi label="증빙 보완" value={`${rows.filter((row) => !row.hasDocument || row.taxEvidenceType === "unverified").length}건`} />
        <Kpi label="사업부 미분류" value={`${rows.filter((row) => recommendBusinessUnit(row).startsWith("미분류")).length}건`} warn />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">관리자 승인카드 Preview</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">일반건은 30초 안에 판단하고 위험건만 상세검토하는 구조입니다.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-bold text-slate-500">현재 지출자료가 없습니다.</div>
          ) : rows.map((row) => {
            const unit = recommendBusinessUnit(row);
            const costNature = recommendCostNature(row);
            const needsReview = unit.startsWith("미분류") || !row.hasDocument || row.taxEvidenceType === "unverified";
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

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <State label="사업부 추천" value={unit} warn={unit.startsWith("미분류")} />
                  <State label="비용성격 추천" value={costNature} />
                  <State label="증빙" value={row.hasDocument ? "파일 첨부" : "미첨부"} warn={!row.hasDocument} />
                  <State label="세무증빙" value={row.taxEvidenceType === "unverified" ? "미확인" : row.taxEvidenceType} warn={row.taxEvidenceType === "unverified"} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white opacity-50">승인 Preview</button>
                  <button type="button" disabled className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700 opacity-50">사업부 변경 Preview</button>
                  <button type="button" disabled className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-black text-slate-700 opacity-50">보완요청 Preview</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
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
