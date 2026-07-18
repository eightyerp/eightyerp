import { createSignedQuoteFileUrl, getQuoteShareByToken } from "@/lib/crm/quote-mgmt";
import { ERP_QUOTE_STATUS_BADGE } from "@/lib/crm/quote-constants";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function CustomerQuoteSharePage({ params }: Props) {
  const { token } = await params;

  let share = null;
  let loadError: string | null = null;
  try {
    share = await getQuoteShareByToken(token);
  } catch (error) {
    loadError =
      error instanceof Error
        ? "견적을 불러오지 못했습니다. 링크가 유효한지 확인해 주세요."
        : "견적을 불러오지 못했습니다.";
  }

  if (!share) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">견적을 찾을 수 없습니다.</p>
          <p className="mt-2">
            {loadError ||
              "링크가 만료되었거나 잘못된 주소입니다. 담당자에게 문의해 주세요."}
          </p>
        </div>
      </main>
    );
  }

  const signedUrls: Record<string, string> = {};
  await Promise.all(
    (share.files ?? []).map(async (f) => {
      try {
        signedUrls[f.id] = await createSignedQuoteFileUrl(f.file_path, 60 * 60);
      } catch {
        // ignore
      }
    }),
  );

  const primaryPdf = (share.files ?? []).find(
    (f) => f.file_type === "pdf" && signedUrls[f.id],
  );
  const badge =
    ERP_QUOTE_STATUS_BADGE[share.status] || "bg-gray-100 text-gray-600";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="border-b border-navy-900/10 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          <span className="text-2xl font-bold text-gold-400">80</span>
          <div>
            <p className="text-sm font-semibold tracking-wide">EIGHTY</p>
            <p className="text-xs text-white/60">주식회사 에잇티 견적 확인</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">고객</p>
              <h1 className="mt-1 text-xl font-bold text-navy-900">
                {share.customer_name}
              </h1>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {share.title}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {[
                  share.quote_type,
                  share.quote_number ? `번호 ${share.quote_number}` : null,
                  `V${share.version_number}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}
            >
              {share.status}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-[11px] text-gray-400">최종금액</dt>
              <dd className="mt-0.5 text-lg font-semibold text-navy-900">
                {(share.final_amount ?? 0).toLocaleString("ko-KR")}원
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-[11px] text-gray-400">유효기간</dt>
              <dd className="mt-0.5 text-sm font-medium text-gray-800">
                {share.valid_until || "-"}
              </dd>
            </div>
          </dl>

          {share.customer_message && (
            <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50/60 px-3 py-3 text-sm text-navy-900 whitespace-pre-wrap">
              {share.customer_message}
            </div>
          )}

          <p className="mt-4 text-xs text-gray-400">
            ※ 내부 메모·단가 등 원가 정보는 표시되지 않습니다.
          </p>
        </section>

        {(share.items?.length ?? 0) > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-navy-900">공종별 금액</h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {share.items.map((item, idx) => (
                <li
                  key={`${item.trade_name}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">{item.trade_name}</p>
                    {item.item_name && (
                      <p className="text-xs text-gray-500">{item.item_name}</p>
                    )}
                  </div>
                  <p className="font-medium text-navy-800">
                    {(item.amount ?? 0).toLocaleString("ko-KR")}원
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy-900">첨부파일</h2>
          {(share.files?.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-gray-400">첨부파일이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {share.files.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    {f.file_name}
                    <span className="ml-2 text-xs text-gray-400">
                      {f.file_type.toUpperCase()}
                    </span>
                  </span>
                  {signedUrls[f.id] ? (
                    <a
                      href={signedUrls[f.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-navy-800 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {f.file_type === "pdf" ? "미리보기 / 다운로드" : "다운로드"}
                    </a>
                  ) : (
                    <span className="text-xs text-red-500">링크 생성 실패</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {primaryPdf && signedUrls[primaryPdf.id] && (
            <div className="mt-4 overflow-hidden rounded-lg border">
              <iframe
                title="견적 PDF"
                src={signedUrls[primaryPdf.id]}
                className="h-[70vh] w-full"
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
