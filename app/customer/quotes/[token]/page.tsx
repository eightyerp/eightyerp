import type { Metadata } from "next";
import QuoteDocumentView from "@/components/quotes/QuoteDocumentView";
import QuoteShareDownloadLink from "@/components/quotes/QuoteShareDownloadLink";
import {
  resolveQuoteBrandFromShare,
} from "@/lib/crm/quote-brand-shared";
import {
  createSignedQuoteFileUrl,
  getQuoteShareByToken,
} from "@/lib/crm/quote-mgmt";
import {
  buildQuoteSharePageTitle,
  parseQuoteCoverParam,
  type QuoteDocumentModel,
} from "@/lib/crm/quote-document";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ cover?: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    const share = await getQuoteShareByToken(token);
    const title = buildQuoteSharePageTitle(share?.customer_name);
    return {
      title,
      openGraph: { title },
    };
  } catch {
    return {
      title: buildQuoteSharePageTitle(null),
    };
  }
}

export default async function CustomerQuoteSharePage({
  params,
  searchParams,
}: Props) {
  const { token } = await params;
  const query = await searchParams;
  const showCover = parseQuoteCoverParam(query.cover);

  let share = null;
  let loadError: string | null = null;
  try {
    share = await getQuoteShareByToken(token);
  } catch {
    loadError =
      "견적을 불러오지 못했습니다. 링크가 유효한지 확인해 주세요.";
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

  const brand = resolveQuoteBrandFromShare(share);

  const documentModel: QuoteDocumentModel = {
    customerName: share.customer_name,
    title: share.title,
    quoteType: share.quote_type,
    quoteMode: share.quote_mode,
    quoteNumber: share.quote_number,
    versionNumber: share.version_number,
    status: share.status,
    validUntil: share.valid_until,
    issuedAt: share.issued_at,
    customerMessage: share.customer_message,
    discountAmount: Number(share.discount_amount ?? 0),
    lxDiscountRate: Number(share.lx_discount_rate ?? 0),
    brand,
    showCover,
    items: (share.items ?? []).map((item) => ({
      trade_name: item.trade_name,
      item_name: item.item_name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      amount: item.amount,
      cost_type: item.cost_type,
      is_lx_material: item.is_lx_material,
      lx_discount_base_amount: item.lx_discount_base_amount,
      lx_discount_type: item.lx_discount_type,
      lx_discount_value: item.lx_discount_value,
      sort_order: item.sort_order,
    })),
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <QuoteDocumentView model={documentModel} variant="mobile" />

      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-10">
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
                    <div className="flex flex-wrap gap-2">
                      {f.file_type === "pdf" ? (
                        <a
                          href={signedUrls[f.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-navy-800 px-3 py-1.5 text-xs font-medium text-navy-800"
                        >
                          미리보기
                        </a>
                      ) : null}
                      <QuoteShareDownloadLink
                        href={signedUrls[f.id]}
                        customerName={share.customer_name}
                        fileType={f.file_type}
                        className="rounded-md bg-navy-800 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        다운로드
                      </QuoteShareDownloadLink>
                    </div>
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

        <p className="text-center text-xs text-slate-500">
          ※ 내부 메모·단가 등 원가 정보는 표시되지 않습니다.
        </p>
      </div>
    </main>
  );
}
