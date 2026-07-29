/**
 * Structured plain-English vote / bill summary card.
 * Matches the JSON schema returned by `/api/format-bill-summary`
 * and `lib/format-bill-summary.js`.
 */
export interface BillSummaryCard {
  /** 1–2 sentence plain-English summary (no legalese). */
  summary: string;
  /** What voting YEA supports. */
  yea_means: string;
  /** What voting NAY supports. */
  nay_means: string;
  /** Short Yea button label (e.g. "End Rebates"). */
  yea_label: string;
  /** Short Nay button label (e.g. "Keep Rebates"). */
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

export const BILL_SUMMARY_SYSTEM_PROMPT = `You write plain-English vote cards for a civic app.
Readers are not lawyers. No bill numbers in the prose unless essential.
Tone: direct, neutral, concrete. No slogans, no fear-mongering, no legalese.

Return ONLY valid JSON with exactly these keys:
- summary: 1-2 sentences on what the measure does
- yea_means: 1 concise sentence — what voting YEA supports
- nay_means: 1 concise sentence — what voting NAY supports
- yea_label: 2-4 word button label for Yea (verb + object, e.g. "End Rebates")
- nay_label: 2-4 word button label for Nay (opposing verb + object, e.g. "Keep Rebates")

Labels must be short, parallel, and easy to tap. Prefer concrete nouns (rebates, funding, bans) over vague words (bill, measure, change).`;

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

Example tone (Homeowner Energy Freedom Act / rebate repeal):
{
  "summary": "Eliminates federal funding and grants that subsidize energy-efficient home appliance rebates, contractor training, and local eco-friendly building codes.",
  "yea_means": "You support ending these federal energy rebates and building code grants to cut government spending.",
  "nay_means": "You support keeping federal funds active to lower home electrification and energy upgrade costs for low-to-middle-income families.",
  "yea_label": "End Rebates",
  "nay_label": "Keep Rebates"
}

Produce the JSON card for the bill above.`;
}

/**
 * Client/server helper that calls our Vercel formatter endpoint.
 * Adjusts the requested TypeScript API to this repo's serverless stack.
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

  return {
    summary: data.summary || "",
    yea_means: data.yea_means || "",
    nay_means: data.nay_means || "",
    yea_label: data.yea_label || "Yea",
    nay_label: data.nay_label || "Nay",
    source: data.source,
  };
}
