/**
 * Plain-English bill / roll-call summary cards for Action Match UI.
 * Uses an LLM when OPENAI_API_KEY (or compatible) is set; otherwise a
 * deterministic heuristic fallback so the product never goes blank.
 */

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

const EMPTY_CARD = {
  summary: "",
  yea_means: "",
  nay_means: "",
  yea_label: "Yea",
  nay_label: "Nay",
};

const SYSTEM_PROMPT = `You write plain-English vote cards for a civic app.
Readers are not lawyers. No bill numbers in the prose unless essential.
Tone: direct, neutral, concrete. No slogans, no fear-mongering, no legalese.

Return ONLY valid JSON with exactly these keys:
- summary: 1-2 sentences on what the measure does
- yea_means: 1 concise sentence — what voting YEA supports
- nay_means: 1 concise sentence — what voting NAY supports
- yea_label: 2-4 word button label for Yea (verb + object, e.g. "End Rebates")
- nay_label: 2-4 word button label for Nay (opposing verb + object, e.g. "Keep Rebates")

Labels must be short, parallel, and easy to tap. Prefer concrete nouns (rebates, funding, bans) over vague words (bill, measure, change).`;

function buildUserPrompt(rawSummary, billTitle) {
  const title = String(billTitle || "").trim() || "Untitled measure";
  const summary = String(rawSummary || "").trim() || "(No CRS summary available.)";
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

function buildPrompt(rawSummary, billTitle) {
  return {
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(rawSummary, billTitle),
  };
}

function cleanText(value, max = 400) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanLabel(value, fallback) {
  const label = cleanText(value, 40)
    .replace(/^["']|["']$/g, "")
    .replace(/\.$/, "");
  if (!label) return fallback;
  // Keep button labels short.
  const words = label.split(/\s+/).slice(0, 4);
  return words.join(" ");
}

function normalizeCard(raw = {}, fallbackTitle = "") {
  const card = {
    summary: cleanText(raw.summary, 420),
    yea_means: cleanText(raw.yea_means, 280),
    nay_means: cleanText(raw.nay_means, 280),
    yea_label: cleanLabel(raw.yea_label, "Yea"),
    nay_label: cleanLabel(raw.nay_label, "Nay"),
  };
  if (!card.summary) {
    card.summary = cleanText(
      fallbackTitle
        ? `House action related to ${fallbackTitle}.`
        : "Recent congressional roll-call vote.",
      420
    );
  }
  if (!card.yea_means) {
    card.yea_means = "You support advancing this measure on this roll call.";
  }
  if (!card.nay_means) {
    card.nay_means = "You support rejecting this measure on this roll call.";
  }
  return card;
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function firstSentences(text, max = 2) {
  const protectedText = String(text || "").replace(
    /\b(No|Nos|Mr|Mrs|Ms|Dr|Sen|Rep|vs|etc|U\.S|Dept)\./gi,
    "$1\u2024"
  );
  const parts = protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
  return parts.slice(0, max).join(" ");
}

/**
 * Deterministic fallback when no LLM key is configured or the model fails.
 */
function heuristicFormat(rawSummary, billTitle = "") {
  const title = cleanText(billTitle, 160);
  const body = cleanText(rawSummary, 2000);
  const haystack = `${title} ${body}`.toLowerCase();

  let summary = firstSentences(body, 2);
  if (!summary && title) {
    summary = `Congressional action on ${title}.`;
  }
  if (!summary) summary = "Recent congressional roll-call vote.";

  let yea_means = "You support advancing this measure on this roll call.";
  let nay_means = "You support rejecting this measure on this roll call.";
  let yea_label = "Support Measure";
  let nay_label = "Oppose Measure";

  if (/repeal|eliminat|end(s|ing)?\b|terminat|defund/.test(haystack)) {
    const topic = /rebate/.test(haystack)
      ? "rebates"
      : /grant/.test(haystack)
        ? "grants"
        : /tax/.test(haystack)
          ? "this tax provision"
          : "this program";
    yea_means = `You support ending ${topic} described in this measure.`;
    nay_means = `You support keeping ${topic} in place.`;
    yea_label = /rebate/.test(haystack) ? "End Rebates" : "End Program";
    nay_label = /rebate/.test(haystack) ? "Keep Rebates" : "Keep Program";
  } else if (/appropriat|funding|authorize|authorize[sd]?|budget/.test(haystack)) {
    yea_means = "You support approving the funding or authorization in this measure.";
    nay_means = "You support blocking this funding or authorization.";
    yea_label = "Approve Funding";
    nay_label = "Block Funding";
  } else if (/amendment|amdt/.test(haystack)) {
    yea_means = "You support adopting this amendment.";
    nay_means = "You support rejecting this amendment.";
    yea_label = "Adopt Amendment";
    nay_label = "Reject Amendment";
  } else if (/ban|prohibit|restrict|criminaliz/.test(haystack)) {
    yea_means = "You support the restriction or ban in this measure.";
    nay_means = "You support leaving current rules unchanged.";
    yea_label = "Support Ban";
    nay_label = "Oppose Ban";
  }

  return normalizeCard(
    { summary, yea_means, nay_means, yea_label, nay_label },
    title
  );
}

async function callOpenAiCompatible({ system, user }) {
  const apiKey = env(
    "OPENAI_API_KEY",
    "OPENAI_KEY",
    "AI_API_KEY",
    "LLM_API_KEY"
  );
  if (!apiKey) return null;

  const base = (
    env("OPENAI_BASE_URL", "LLM_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env("OPENAI_MODEL", "LLM_MODEL") || "gpt-4o-mini";

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LLM ${response.status}: ${text.slice(0, 180)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  if (!parsed) throw new Error("LLM returned non-JSON content.");
  return parsed;
}

/**
 * @param {string} rawSummary
 * @param {string} billTitle
 * @param {{ forceHeuristic?: boolean }} [options]
 * @returns {Promise<{
 *   summary: string,
 *   yea_means: string,
 *   nay_means: string,
 *   yea_label: string,
 *   nay_label: string,
 *   source: "llm" | "heuristic"
 * }>}
 */
async function formatBillSummary(rawSummary, billTitle = "", options = {}) {
  const title = String(billTitle || "").trim();
  const summary = String(rawSummary || "").trim();

  if (options.forceHeuristic) {
    return { ...heuristicFormat(summary, title), source: "heuristic" };
  }

  try {
    const prompt = buildPrompt(summary, title);
    const llm = await callOpenAiCompatible(prompt);
    if (llm) {
      return {
        ...normalizeCard(llm, title),
        source: "llm",
      };
    }
  } catch (error) {
    console.warn("[formatBillSummary]", error.message || error);
  }

  return { ...heuristicFormat(summary, title), source: "heuristic" };
}

module.exports = {
  EMPTY_CARD,
  SYSTEM_PROMPT,
  buildPrompt,
  buildUserPrompt,
  heuristicFormat,
  formatBillSummary,
  normalizeCard,
};
