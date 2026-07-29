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
  /** Action label (e.g. "Pass Safety Rules" or fallback "Support Bill"). */
  yea_label: string;
  /** Action label (e.g. "Reject Safety Rules" or fallback "Oppose Bill"). */
  nay_label: string;
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

export const DEFAULT_YEA_LABEL = "Support Bill";
export const DEFAULT_NAY_LABEL = "Oppose Bill";

export const BILL_SUMMARY_SYSTEM_PROMPT = `You write plain-English vote cards for a civic app.

Rules (strict):
1. Analyze ONLY the provided bill title + congressional/CRS text. Do not invent programs, repeals, bans, or funding cuts that are not clearly in the text.
2. If the text is thin, unclear, or mostly procedural, say what you can neutrally and set yea_label to "Support Bill" and nay_label to "Oppose Bill".
3. summary must be 1–2 COMPLETE sentences in plain English (never cut off mid-sentence, never paste truncated legalese).
4. yea_means / nay_means must describe real-world outcomes of Yea vs Nay on THIS measure — not a stock “You support ending…” template.
5. Labels are 2–4 words, parallel, concrete. Only use vivid verbs like End/Keep/Pass/Reject when the text clearly supports them; otherwise use Support Bill / Oppose Bill.
6. No slogans, no fear-mongering, no bill jargon.

Return ONLY valid JSON with exactly these keys:
{
  "summary": string,
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

Raw congressional / CRS text:
"""
${summary.slice(0, 6000)}
"""

If unsure, set confident=false and use Support Bill / Oppose Bill labels.
Do NOT reuse rebate/end-program framing unless the source text clearly says so.

Produce the JSON card for the bill above.`;
}

function withFallbacks(data: Partial<BillSummaryCard>): BillSummaryCard {
  return {
    summary:
      String(data.summary || "").trim() ||
      "This is a recent congressional roll-call vote on the linked measure.",
    yea_means:
      String(data.yea_means || "").trim() ||
      "A Yea vote supports advancing this measure as written on this roll call.",
    nay_means:
      String(data.nay_means || "").trim() ||
      "A Nay vote supports rejecting this measure on this roll call.",
    yea_label: String(data.yea_label || "").trim() || DEFAULT_YEA_LABEL,
    nay_label: String(data.nay_label || "").trim() || DEFAULT_NAY_LABEL,
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

  return withFallbacks(data);
}
