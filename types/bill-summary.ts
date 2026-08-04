/**
 * Structured plain-English vote / bill summary card.
 * Matches the JSON schema returned by `/api/format-bill-summary`
 * and `lib/format-bill-summary.js`.
 */
export interface BillSummaryCard {
  /** Plain English description of the core issue (1–2 complete sentences). */
  summary: string;
  /** Real-world outcome of a Yea vote. */
  yea_means: string;
  /** Real-world outcome of a Nay vote. */
  nay_means: string;
  /** Action label (e.g. "Pass Safety Rules" or fallback "Support Measure"). */
  yea_label: string;
  /** Action label (e.g. "Reject Safety Rules" or fallback "Oppose Measure"). */
  nay_label: string;
  /** Short plain-English topic for Action Match cards. */
  short_title?: string;
  /** One-sentence plain-English summary of what the measure does. */
  plain_summary?: string;
  /** Legacy alias of plain_summary. */
  what_it_does?: string;
  /** What a Support / Yea vote advocates for. */
  yea_impact?: string;
  /** What an Oppose / Nay vote advocates for. */
  nay_impact?: string;
  /** Where the card came from. */
  source?: "llm" | "heuristic";
}

export interface FormatBillSummaryOptions {
  /** Skip the LLM and use the local heuristic. */
  forceHeuristic?: boolean;
  /** Override API path (defaults to /api/format-bill-summary). */
  endpoint?: string;
  /** Optional Congress.gov / site API key query passthrough. */
  apiKey?: string;
}

export const DEFAULT_YEA_LABEL = "Support Measure";
export const DEFAULT_NAY_LABEL = "Oppose Measure";

export const BILL_SUMMARY_SYSTEM_PROMPT = `You are an expert civic journalist translating complex federal legislation for everyday voters.

RULES:
- BAN JARGON: Eliminate references to tax codes, administrative databases (e.g. WEAMS), statutory sub-clauses, and legalisms.
- MAXIMUM LENGTH: 2 short sentences (~35 words max).
- FOCUS ON REAL-WORLD IMPACT: Explain what changes for an ordinary citizen's wallet, rights, or community.
- Analyze ONLY the provided bill title + congressional/CRS text. Do not invent programs, repeals, bans, or funding cuts that are not clearly in the text.
- yea_means / nay_means must describe real-world outcomes of Yea vs Nay on THIS measure — not a stock template.
- If the text is thin or procedural, set yea_label to "Support Measure" and nay_label to "Oppose Measure".
- Labels are 2–4 words, parallel, concrete.
- No slogans and no fear-mongering.

Format your response in plain, direct English.

Return ONLY valid JSON with exactly these keys:
{
  "summary": string,
  "plain_summary": string,
  "yea_means": string,
  "nay_means": string,
  "yea_label": string,
  "nay_label": string,
  "confident": boolean
}`;

export function buildBillSummaryUserPrompt(
  rawSummary: string,
  billTitle: string
): string {
  const title = String(billTitle || "").trim() || "Untitled measure";
  const summary =
    String(rawSummary || "").trim() || "(No CRS summary available.)";
  return `Bill title: ${title}

Raw congressional / CRS text (translate — do not paste jargon):
"""
${summary.slice(0, 6000)}
"""

If unsure, set confident=false and use Support Measure / Oppose Measure labels.
Do NOT reuse rebate/end-program framing unless the source text clearly says so.
Keep summary and plain_summary to ≤2 short sentences (~35 words).

Produce the JSON card for the bill above.`;
}

function isGenericMeans(text = ""): boolean {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return true;
  return (
    /^a yea vote supports advancing this measure/.test(value) ||
    /^a nay vote supports rejecting this measure/.test(value) ||
    /^you support advancing this measure/.test(value) ||
    /^you support rejecting this measure/.test(value) ||
    /^support this (roll-call|roll call|measure|bill)/.test(value) ||
    /^oppose this (roll-call|roll call|measure|bill)/.test(value)
  );
}

function isBannedMeansTemplate(text = ""): boolean {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;
  return (
    /you support ending this program described in this measure/.test(value) ||
    /you support keeping this program in place/.test(value) ||
    /you support ending .+ described in this measure/.test(value)
  );
}

function withFallbacks(
  data: Partial<BillSummaryCard>,
  options: { structuredYea?: boolean; structuredNay?: boolean } = {}
): BillSummaryCard {
  let yea_means = String(data.yea_means || "").trim();
  let nay_means = String(data.nay_means || "").trim();

  if (isBannedMeansTemplate(yea_means) && !options.structuredYea) {
    yea_means = "";
  }
  if (isBannedMeansTemplate(nay_means) && !options.structuredNay) {
    nay_means = "";
  }

  const meansAreGeneric = isGenericMeans(yea_means) || isGenericMeans(nay_means) ||
    isBannedMeansTemplate(yea_means) || isBannedMeansTemplate(nay_means);
  let yea_label = String(data.yea_label || "").trim();
  let nay_label = String(data.nay_label || "").trim();
  if (meansAreGeneric) {
    yea_label = DEFAULT_YEA_LABEL;
    nay_label = DEFAULT_NAY_LABEL;
  }

  return {
    summary:
      String(data.summary || "").trim() ||
      "This is a recent congressional roll-call vote on the linked measure.",
    yea_means:
      yea_means ||
      "A Yea vote supports advancing this measure as written on this roll call.",
    nay_means:
      nay_means ||
      "A Nay vote supports rejecting this measure on this roll call.",
    yea_label: yea_label || DEFAULT_YEA_LABEL,
    nay_label: nay_label || DEFAULT_NAY_LABEL,
    source: data.source,
  };
}

/**
 * Client/server helper that calls our Vercel formatter endpoint.
 */
export async function formatBillSummary(
  rawSummary: string,
  billTitle: string,
  options: FormatBillSummaryOptions = {}
): Promise<BillSummaryCard> {
  const endpoint = options.endpoint || "/api/format-bill-summary";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawSummary,
      billTitle,
      forceHeuristic: Boolean(options.forceHeuristic),
      ...(options.apiKey ? { api_key: options.apiKey } : {}),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as BillSummaryCard & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "Could not format bill summary.");
  }

  return withFallbacks(data, {
    structuredYea: Object.prototype.hasOwnProperty.call(data, "yea_means"),
    structuredNay: Object.prototype.hasOwnProperty.call(data, "nay_means"),
  });
}
