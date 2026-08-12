import type { ExpenseDocumentAnalysis, ExpenseDocumentType, ExpensePaymentMethod } from "@/lib/crm/expense-shared";

const MAX_AI_DOCUMENT_BYTES = 12 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function safeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}

function normalizeAnalysis(raw: Record<string, unknown>): ExpenseDocumentAnalysis {
  const documentType = ["receipt", "transaction_statement", "invoice", "other"].includes(
    String(raw.document_type),
  )
    ? (String(raw.document_type) as ExpenseDocumentType)
    : "other";
  const paymentMethod = [
    "bank_transfer",
    "company_card",
    "personal_card",
    "cash",
    "other",
    "",
  ].includes(String(raw.payment_method ?? ""))
    ? (String(raw.payment_method ?? "") as ExpensePaymentMethod | "")
    : "";
  const supplyAmount = safeNumber(raw.supply_amount);
  const vatAmount = safeNumber(raw.vat_amount);
  const totalAmount = safeNumber(raw.total_amount);
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map((item) => String(item)).filter(Boolean).slice(0, 8)
    : [];
  if (totalAmount > 0 && supplyAmount + vatAmount !== totalAmount) {
    warnings.push("공급가와 부가세 합계가 총액과 달라 금액 확인이 필요합니다.");
  }
  return {
    documentType,
    vendorName: String(raw.vendor_name ?? "").trim(),
    businessNumber: String(raw.business_number ?? "").trim(),
    phone: String(raw.phone ?? "").trim(),
    expenseDate: String(raw.expense_date ?? "").trim(),
    supplyAmount,
    vatAmount,
    totalAmount,
    paymentMethod,
    description: String(raw.description ?? "").trim(),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0) || 0)),
    warnings,
  };
}

function responseOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content)
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") texts.push(text);
    }
  }
  return texts.join("\n");
}

export type ExpenseAiAnalysisResult =
  | { available: true; analysis: ExpenseDocumentAnalysis }
  | { available: false; error: string };

export async function analyzeExpenseDocumentWithAi(
  file: File,
): Promise<ExpenseAiAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      available: false,
      error: "AI 자동인식 API 키가 아직 연결되지 않았습니다. 증빙은 첨부하고 금액을 직접 입력할 수 있습니다.",
    };
  }
  if (file.size <= 0 || file.size > MAX_AI_DOCUMENT_BYTES) {
    return { available: false, error: "자동인식 파일은 12MB 이하만 지원합니다." };
  }
  const mime = (file.type || "").toLowerCase();
  if (!ACCEPTED_MIME.has(mime)) {
    return { available: false, error: "자동인식은 JPG, PNG, WEBP, PDF를 지원합니다." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const filePart =
    mime === "application/pdf"
      ? {
          type: "input_file",
          filename: file.name || "expense-document.pdf",
          file_data: base64,
        }
      : {
          type: "input_image",
          detail: "high",
          image_url: `data:${mime};base64,${base64}`,
        };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECEIPT_MODEL?.trim() || "gpt-5-mini",
      store: false,
      max_output_tokens: 900,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "한국 지출증빙(영수증, 거래명세서, 세금계산서/청구서)을 읽어 지출요청 초안을 만들어 주세요. 숫자는 원 단위 정수로 반환하세요. 상호명, 사업자번호, 전화번호, 결제일, 공급가, 부가세, 합계, 결제수단, 지출내용을 추출하세요. 불확실한 값은 빈 문자열 또는 0으로 두고 warnings에 한국어로 확인사항을 적으세요. 거래명세서의 총 공급가/세액/합계가 여러 줄이면 문서 전체 합계를 사용하세요.",
            },
            filePart,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "expense_document_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              document_type: {
                type: "string",
                enum: ["receipt", "transaction_statement", "invoice", "other"],
              },
              vendor_name: { type: "string" },
              business_number: { type: "string" },
              phone: { type: "string" },
              expense_date: { type: "string" },
              supply_amount: { type: "integer", minimum: 0 },
              vat_amount: { type: "integer", minimum: 0 },
              total_amount: { type: "integer", minimum: 0 },
              payment_method: {
                type: "string",
                enum: ["bank_transfer", "company_card", "personal_card", "cash", "other", ""],
              },
              description: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: [
              "document_type",
              "vendor_name",
              "business_number",
              "phone",
              "expense_date",
              "supply_amount",
              "vat_amount",
              "total_amount",
              "payment_method",
              "description",
              "confidence",
              "warnings",
            ],
          },
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[expense-ai] OpenAI response failed", response.status, text.slice(0, 500));
    return {
      available: false,
      error: "증빙 자동인식에 실패했습니다. 직접 입력 후 제출할 수 있습니다.",
    };
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const outputText = responseOutputText(payload);
  if (!outputText) {
    return { available: false, error: "증빙에서 정보를 읽지 못했습니다. 직접 입력해 주세요." };
  }
  try {
    return { available: true, analysis: normalizeAnalysis(JSON.parse(outputText)) };
  } catch (error) {
    console.error("[expense-ai] structured output parse failed", error);
    return { available: false, error: "자동인식 결과를 처리하지 못했습니다. 직접 입력해 주세요." };
  }
}