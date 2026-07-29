/**
 * Plain-English bill / roll-call summary cards for Action Match UI.
 * Uses an LLM when OPENAI_API_KEY (or compatible) is set; otherwise a
 * conservative heuristic that never invents “ends a program” templates.
 */

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

const DEFAULT_YEA_LABEL = "Support Bill";
const DEFAULT_NAY_LABEL = "Oppose Bill";

const EMPTY_CARD = {
  summary: "",
  yea_means: "",
  nay_means: "",
  yea_label: DEFAULT_YEA_LABEL,
  nay_label: DEFAULT_NAY_LABEL,
};

const SYSTEM_PROMPT = `You write plain-English vote cards for a civic app.

Rules (strict):
1. Analyze ONLY the provided bill title + congressional/CRS text. Do not invent programs, repeals, bans, or funding cuts that are not clearly in the text.
2. If the text is thin, unclear, or mostly procedural, say what you can neutrally and set yea_label to "Support Bill" and nay_label to "Oppose Bill".
3. summary must be 1–2 COMPLETE sentences in plain English (never cut off mid-sentence, never paste truncated legalese).
4. yea_means / nay_means must describe real-world outcomes of Yea vs Nay on THIS measure — not a stock “You support ending…” template.
5. Labels are 2–4 words, parallel, concrete. Only use vivid verbs like End/Keep/Pass/Reject when the text clearly supports them; otherwise use Support Bill / Oppose Bill.
6. No slogans, no fear-mongering, no bill jargon (no “provided that”, “notwithstanding”, section cites).

Return ONLY valid JSON with exactly these keys:
{
  "summary": string,
  "yea_means": string,
  "nay_means": string,
  "yea_label": string,
  "nay_label": string,
  "confident": boolean
}`;

function buildUserPrompt(rawSummary, billTitle) {
  const title = String(billTitle || "").trim() || "Untitled measure";
  const summary = String(rawSummary || "").trim() || "(No CRS summary available.)";
  return `Bill title: ${title}

Raw congressional / CRS text:
"""
${summary.slice(0, 6000)}
"""

Good example ONLY when the source text is clearly about ending appliance rebates:
{
  "summary": "Eliminates federal funding and grants that subsidize energy-efficient home appliance rebates, contractor training, and local eco-friendly building codes.",
  "yea_means": "A Yea vote backs ending these federal energy rebates and building-code grants.",
  "nay_means": "A Nay vote keeps the rebate and grant programs available for home energy upgrades.",
  "yea_label": "End Rebates",
  "nay_label": "Keep Rebates",
  "confident": true
}

If this bill is about safety rules, funding, or something else, do NOT reuse the rebate/end-program framing.
If unsure, set confident=false and use Support Bill / Oppose Bill labels.

Produce the JSON card for the bill above.`;
}

function buildPrompt(rawSummary, billTitle) {
  return {
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(rawSummary, billTitle),
  };
}

function collapseWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  const protectedText = collapseWhitespace(text).replace(
    /\b(No|Nos|Mr|Mrs|Ms|Dr|Sen|Rep|vs|etc|U\.S|Dept|Inc|Corp|Co)\./gi,
    "$1\u2024"
  );
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
}

/**
 * Return up to `maxSentences` complete sentences. Never truncate mid-sentence.
 */
function completeSentences(text, { maxSentences = 2, maxChars = 480 } = {}) {
  const sentences = splitSentences(text);
  if (!sentences.length) return "";

  const picked = [];
  for (const sentence of sentences) {
    if (picked.length >= maxSentences) break;
    // Skip obvious fragment leftovers from bad upstream truncation.
    if (sentence.length < 24 && !/[.!?]$/.test(sentence)) continue;
    const candidate = picked.length
      ? `${picked.join(" ")} ${sentence}`
      : sentence;
    if (candidate.length > maxChars && picked.length) break;
    // Prefer keeping one full long sentence over chopping it.
    picked.push(sentence);
    if (candidate.length > maxChars) break;
  }

  if (!picked.length) {
    const first = sentences[0];
    return /[.!?]$/.test(first) ? first : `${first.replace(/[,:;–—-]+$/, "")}.`;
  }

  let out = picked.join(" ");
  if (!/[.!?]$/.test(out)) out = `${out}.`;
  return out;
}

function cleanLabel(value, fallback) {
  const label = collapseWhitespace(value)
    .replace(/^["']|["']$/g, "")
    .replace(/\.$/, "");
  if (!label) return fallback;
  return label.split(/\s+/).slice(0, 4).join(" ");
}

function looksLikeHallucinatedEndProgram(card, sourceText) {
  const label = `${card.yea_label || ""} ${card.nay_label || ""}`.toLowerCase();
  const means = `${card.yea_means || ""} ${card.nay_means || ""}`.toLowerCase();
  const source = String(sourceText || "").toLowerCase();
  const claimsEnd =
    /\bend (program|programs|rebates|grants|funding)\b/.test(label) ||
    /\b(ending|eliminate|eliminates|repeal|repeals)\b/.test(means);
  if (!claimsEnd) return false;
  const sourceSupports =
    /\b(repeal|repeals|eliminat|terminat|defund|end(s|ing)? the)\b/.test(source) ||
    /\brebate/.test(source);
  return !sourceSupports;
}

function normalizeCard(raw = {}, fallbackTitle = "", sourceText = "") {
  const confident =
    raw.confident === true ||
    String(raw.confident || "").toLowerCase() === "true";

  let summary = completeSentences(raw.summary || "", {
    maxSentences: 2,
    maxChars: 480,
  });
  let yea_means = completeSentences(raw.yea_means || "", {
    maxSentences: 1,
    maxChars: 240,
  });
  let nay_means = completeSentences(raw.nay_means || "", {
    maxSentences: 1,
    maxChars: 240,
  });
  let yea_label = cleanLabel(raw.yea_label, DEFAULT_YEA_LABEL);
  let nay_label = cleanLabel(raw.nay_label, DEFAULT_NAY_LABEL);

  if (!confident) {
    yea_label = DEFAULT_YEA_LABEL;
    nay_label = DEFAULT_NAY_LABEL;
  }

  const draft = { summary, yea_means, nay_means, yea_label, nay_label };
  if (looksLikeHallucinatedEndProgram(draft, `${fallbackTitle} ${sourceText}`)) {
    yea_label = DEFAULT_YEA_LABEL;
    nay_label = DEFAULT_NAY_LABEL;
    if (/\bend(ing)? (these|the)?\s*(federal )?energy rebates|ending this program|end this program/.test(
      `${yea_means} ${nay_means}`.toLowerCase()
    )) {
      yea_means =
        "A Yea vote supports advancing this measure as written on this roll call.";
      nay_means =
        "A Nay vote supports rejecting this measure on this roll call.";
    }
  }

  if (!summary) {
    summary = fallbackTitle
      ? `This roll call concerns ${fallbackTitle}.`
      : "This is a recent congressional roll-call vote on the linked measure.";
  }
  if (!yea_means) {
    yea_means =
      "A Yea vote supports advancing this measure as written on this roll call.";
  }
  if (!nay_means) {
    nay_means =
      "A Nay vote supports rejecting this measure on this roll call.";
  }
  if (!yea_label) yea_label = DEFAULT_YEA_LABEL;
  if (!nay_label) nay_label = DEFAULT_NAY_LABEL;

  return {
    summary,
    yea_means,
    nay_means,
    yea_label,
    nay_label,
  };
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

/**
 * Resolutions and floor motions that should not drive Action Match vote cards.
 */
function isProceduralLegislation(input = {}) {
  const type = String(input.legislationType || input.type || "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();
  const billNumber = String(input.billNumber || input.bill_number || "")
    .toLowerCase()
    .replace(/[.\s_-]/g, "");
  const billId = String(input.billId || input.bill_id || input.id || "")
    .toLowerCase()
    .replace(/[.\s_-]/g, "");
  const hay = `${billNumber} ${billId}`;

  if (["hres", "sres", "hconres", "sconres"].includes(type)) return true;
  if (/(^|[^a-z])(hres|sres|hconres|sconres)\d*/.test(hay)) return true;
  if (/federal-\d+-(hres|sres|hconres|sconres)-/.test(billId)) return true;

  const question = `${input.voteQuestion || ""} ${input.title || ""} ${
    input.result || ""
  }`.toLowerCase();
  if (
    /motion to (adjourn|table|reconsider|recommit)|previous question|suspend the rules|election of speaker|approve the journal|quorum call|ordering a second|committee of the whole/.test(
      question
    )
  ) {
    return true;
  }
  return false;
}

function classifyVoteKind(voteQuestion = "", result = "", meta = {}) {
  if (isProceduralLegislation({ ...meta, voteQuestion, result })) {
    return "procedural";
  }
  const q = `${voteQuestion} ${result}`.toLowerCase();
  if (
    /\bon passage\b|\bfinal passage\b|agreeing to the (conference )?report|concurring in the senate amendment|concurring in senate amendment/.test(
      q
    )
  ) {
    return "final_passage";
  }
  if (/\bamendment\b|\bamdt\b/.test(q)) return "amendment";
  if (
    /motion to (adjourn|table|reconsider|recommit)|previous question|suspend the rules|election of speaker|approve the journal|quorum call|ordering a second|committee of the whole/.test(
      q
    )
  ) {
    return "procedural";
  }
  return "other";
}

/**
 * Conservative fallback: complete sentences from source text, safe labels.
 * Does NOT apply “End Program” keyword templates.
 */
function heuristicFormat(rawSummary, billTitle = "") {
  const title = collapseWhitespace(billTitle).slice(0, 160);
  const body = collapseWhitespace(rawSummary);
  let summary = completeSentences(body, { maxSentences: 2, maxChars: 480 });

  // Drop legalese fragments that are clearly mid-thought / truncated.
  if (summary && !/[.!?]$/.test(summary)) {
    summary = `${summary.replace(/[,:;–—-]+$/, "")}.`;
  }
  if (
    !summary ||
    /provided that|notwithstanding|section \d|amend(ed|s)? by striking/i.test(
      summary
    )
  ) {
    summary = title
      ? `This roll call concerns ${title}.`
      : "This is a recent congressional roll-call vote on the linked measure.";
  }

  return normalizeCard(
    {
      summary,
      yea_means:
        "A Yea vote supports advancing this measure as written on this roll call.",
      nay_means:
        "A Nay vote supports rejecting this measure on this roll call.",
      yea_label: DEFAULT_YEA_LABEL,
      nay_label: DEFAULT_NAY_LABEL,
      confident: false,
    },
    title,
    body
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
      temperature: 0.1,
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
        ...normalizeCard(llm, title, summary),
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
  DEFAULT_YEA_LABEL,
  DEFAULT_NAY_LABEL,
  SYSTEM_PROMPT,
  buildPrompt,
  buildUserPrompt,
  completeSentences,
  heuristicFormat,
  formatBillSummary,
  normalizeCard,
  isProceduralLegislation,
  classifyVoteKind,
};
