import Link from "next/link";
import type { FinanceV2PreviewBundle } from "@/lib/crm/finance-v2-preview-bundle";

function compactMoney(value: number) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}억`;
  }
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`;
  return Math.round(amount).toLocaleString("ko-KR");
}

export default function CollectionsV2Preview({ bundle }: { bundle: FinanceV2PreviewBundle }) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">COLLECTIONS V2 · PREVIEW</p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">수금·미수금 관리</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              매출과 수금을 분리하고, 계약금·중도금·잔금 예정과 실제 입금을 연결하는 구조입니다.
            </p>
          </div>
          <Link href="/finance/work-preview" className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-black text-sky-900 hover:bg-sky-100">
            재무업무함으로
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="확정 계약" value={`${bundle.contractCount}건`} sub="ERP 계약원장" />
        <Metric label="확정 수금" value={compactMoney(bundle.confirmedCollectionAmount)} sub="현금유입·미수금 감소" />
        <Metric label="확인대기 수금" value={`${bundle.pendingCollectionCount}건`} sub={compactMoney(bundle.pendingCollectionAmount)} />
        <Metric label="수금계획" value="Gate 3-B" sub="계약금·중도금·잔금" />
      </section>

      {bundle.contractCount === 0 ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">P0 · OPENING BALANCE</p>
          <h2 className="mt-2 text-xl font-black text-red-950">기존 계약·기수금·미수금 이관이 먼저 필요합니다</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-red-900/80">
            현재 ERP 계약원장이 비어 있으면 수금관리에서 선택할 계약이 없습니다. 기존 매출을 신규수금으로 다시 입력하지 않고, 계약금액·기수금·현재 미수금을 기준일 잔액으로 이관하는 방식으로 시작합니다.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Step n="1" title="기존 계약 분석" desc="고객·현장·담당직원 자동매핑" />
            <Step n="2" title="기초잔액 Preview" desc="계약금액·기수금·미수금 대조" />
            <Step n="3" title="승인 후 전환" desc="신규 수금부터 ERP 원장 사용" />
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">SEARCH FLOW</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">전체 계약 셀렉트 → 검색식으로 변경</h2>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-400">
            고객명 · 현장명 · 계약번호 · 전화번호 검색
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Info label="계약금액" value="계약 선택 후" />
            <Info label="기수금" value="기초 + ERP 수금" />
            <Info label="현재 미수금" value="자동 계산" />
            <Info label="다음 예정" value="계약금·중도금·잔금" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <p className="text-xs font-black text-emerald-700">회계 원칙</p>
        <p className="mt-2 text-lg font-black text-emerald-950">수금은 매출이 아닙니다.</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900/80">
          매출은 계약·시공·회계 인식기준으로 관리하고, 수금은 실제 현금유입과 미수금 감소로만 반영합니다. 따라서 수금을 확정해도 영업실적 매출이나 내부 손익 매출에 다시 더하지 않습니다.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <p className="text-xs font-black text-red-600">STEP {n}</p>
      <p className="mt-1 font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{desc}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <p className="text-[10px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
