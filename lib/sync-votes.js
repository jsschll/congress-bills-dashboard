/**
 * Sync House + Senate roll-call votes → Supabase `processed_votes`.
 * Shared by /api/votes (route=sync-votes) and scripts/run-sync-votes.js.
 */

const { createClient } = require("@supabase/supabase-js");
const { fetchLatestSenateVotes } = require("./senate-votes");

const CONGRESS_API = "https://api.congress.gov/v3";
const DEFAULT_CONGRESS = 119;
const DEFAULT_LIMIT = 100;
const MAX_SYNC_LIMIT = 250;
const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You write plain-English vote cards for a civic app.

OUTPUT FORMAT (non-negotiable):
- Respond with VALID JSON only. No markdown, no code fences, no prose before or after the JSON, no apologies, no explanations.
- The entire reply must be one JSON object that parses with JSON.parse.
- Use exactly these keys and no others:
{"summary":"string","yea_means":"string","nay_means":"string","yea_label":"string","nay_label":"string"}

Content rules (strict):
1. Analyze ONLY the provided bill title + congressional/CRS text. Do not invent programs, repeals, bans, or funding cuts that are not clearly in the text.
2. Be SPECIFIC. Name the actual programs, funding, rules, agencies, or people affected when the text says so.
3. summary must be exactly 2 COMPLETE sentences in plain English (no legalese).
   - Sentence 1: what the bill/measure actually changes (policy, funding, rules, rights, or process) — do NOT restate or paraphrase the bill title.
   - Sentence 2: the practical impact on citizens, taxpayers, workers, businesses, or communities if it becomes law / if this vote prevails.
4. yea_means / nay_means must be exactly 1 sentence each describing the real-world outcome of Yea vs Nay.
5. yea_label / nay_label must be 2–3 words, parallel, concrete (e.g. "End Rebates" / "Keep Rebates"). If unsure, use "Support Measure" / "Oppose Measure".
6. No slogans and no fear-mongering.`;

const VOTE_CARD_TOOL = {
  name: "submit_vote_card",
  description:
    "Submit the plain-English vote card. Always call this tool with valid fields; never reply with free-form text.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description:
          "Exactly 2 plain-English sentences: (1) what the measure changes, (2) practical impact on people. Do not repeat the bill title.",
      },
      yea_means: {
        type: "string",
        description: "One sentence: real-world outcome of a Yea vote.",
      },
      nay_means: {
        type: "string",
        description: "One sentence: real-world outcome of a Nay vote.",
      },
      yea_label: {
        type: "string",
        description: "2–3 word Yea button label.",
      },
      nay_label: {
        type: "string",
        description: "2–3 word Nay button label.",
      },
    },
    required: ["summary", "yea_means", "nay_means", "yea_label", "nay_label"],
  },
};

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function getSupabaseAdmin() {
  const url = env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for processed_votes upsert."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function normalizeBillType(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Skip simple resolutions + named floor motions.
 * bill_type H.RES / S.RES, or question contains Motion to Table / Previous Question.
 */
function isExcludedVote(vote = {}) {
  const billType = normalizeBillType(
    vote.legislationType || vote.bill_type || vote.billType || ""
  );
  if (billType === "HRES" || billType === "SRES") return true;

  const question = String(
    vote.voteQuestion || vote.question || vote.vote_question || ""
  );
  if (/motion to table/i.test(question)) return true;
  if (/previous question/i.test(question)) return true;
  return false;
}

function displayDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildVoteId(vote) {
  const congress = Number(vote.congress || DEFAULT_CONGRESS);
  const session = Number(vote.sessionNumber || vote.session_number || 1);
  const roll = Number(vote.rollCallNumber || vote.roll_call_number);
  return `house-vote-${congress}-${session}-${roll}`;
}

function mapHouseVote(raw) {
  const congress = Number(raw.congress || DEFAULT_CONGRESS);
  const sessionNumber = Number(raw.sessionNumber || 1);
  const rollCallNumber = Number(raw.rollCallNumber);
  const billType = String(raw.legislationType || "").trim();
  const legislationNumber = String(raw.legislationNumber || "").trim();
  const billNumber =
    billType && legislationNumber
      ? `${billType.replace(/\./g, "").toUpperCase()} ${legislationNumber}`
      : null;
  const title =
    raw.legislationTitle ||
    raw.voteQuestion ||
    `House Roll Call ${rollCallNumber}`;
  const voteQuestion = raw.voteQuestion || "";
  const result = raw.result || "";
  const voteDate = displayDate(raw.startDate || raw.date || null);
  const typeKey = normalizeBillType(billType).toLowerCase();
  const officialUrl =
    typeKey && legislationNumber
      ? `https://www.congress.gov/bill/${congress}th-congress/${typeKey}/${legislationNumber}`
      : `https://clerk.house.gov/Votes/Details/${congress}${String(
          rollCallNumber
        ).padStart(3, "0")}`;
  const clerkUrl = `https://clerk.house.gov/Votes/Details/${congress}${String(
    rollCallNumber
  ).padStart(3, "0")}`;

  const rollCallId = buildVoteId({
    congress,
    sessionNumber,
    rollCallNumber,
  });
  return {
    // Existing Supabase table PK is roll_call_id (not id).
    roll_call_id: rollCallId,
    bill_id: billNumber || null,
    congress,
    session_number: sessionNumber,
    roll_call_number: rollCallNumber,
    chamber: "house",
    bill_type: billType || null,
    bill_number: billNumber,
    legislation_number: legislationNumber || null,
    title,
    vote_question: voteQuestion,
    result,
    vote_date: voteDate,
    official_url: officialUrl,
    clerk_url: clerkUrl,
    raw_payload: raw,
  };
}

async function fetchLatestHouseVotes(apiKey, { congress, limit }) {
  const url = `${CONGRESS_API}/house-vote/${congress}?format=json&limit=${Math.min(
    250,
    Math.max(limit * 3, limit)
  )}&api_key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url);
  const votes = Array.isArray(data.houseRollCallVotes)
    ? data.houseRollCallVotes
    : [];
  return votes
    .filter((vote) => !isExcludedVote(vote))
    .slice(0, limit)
    .map(mapHouseVote);
}

async function fetchBillSummaryText(vote, apiKey) {
  const type = normalizeBillType(vote.bill_type).toLowerCase();
  const number = vote.legislation_number;
  if (!type || !number) return "";
  try {
    const url = `${CONGRESS_API}/bill/${vote.congress}/${type}/${number}/summaries?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson(url);
    const summaries = data.summaries || [];
    if (!summaries.length) return "";
    const best = summaries.reduce((current, item) => {
      const currentText = String(current?.text || "").replace(/<[^>]+>/g, " ");
      const itemText = String(item?.text || "").replace(/<[^>]+>/g, " ");
      if (!current) return item;
      return itemText.length > currentText.length ? item : current;
    }, null);
    return String(best?.text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (error) {
    console.warn("CRS summary fetch failed:", error.message || error);
    return "";
  }
}

function extractJsonObject(text) {
  let raw = String(text || "").trim();
  if (!raw) return null;

  // Strip common markdown wrappers Claude sometimes adds.
  raw = raw
    .replace(/^```(?:json|JSON)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
  // If the model wrapped JSON in conversational text, keep the object span.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    raw = raw.slice(start, end + 1);
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Tolerate trailing commas / smart quotes from rare model slips.
    try {
      const cleaned = raw
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function normalizeCard(parsed, fallbackTitle) {
  const summary = String(parsed?.summary || "").trim();
  const yea_means = String(parsed?.yea_means || "").trim();
  const nay_means = String(parsed?.nay_means || "").trim();
  let yea_label = String(parsed?.yea_label || "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  let nay_label = String(parsed?.nay_label || "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");

  return {
    summary:
      summary ||
      (fallbackTitle
        ? `This vote concerns ${fallbackTitle}.`
        : "This is a recent House roll-call vote."),
    yea_means:
      yea_means ||
      "A Yea vote supports advancing this bill as written on this vote.",
    nay_means:
      nay_means || "A Nay vote supports rejecting this bill on this vote.",
    yea_label: yea_label || "Support Measure",
    nay_label: nay_label || "Oppose Measure",
  };
}

function buildUserPrompt(title, rawText) {
  return `Bill title (for context only — do not copy it into summary): ${
    title || "Untitled measure"
  }

Raw congressional / CRS text:
"""
${String(rawText || "").slice(0, 6000) || "(No CRS summary available.)"}
"""

Call submit_vote_card with:
- summary: exactly 2 sentences — what changes + practical impact on people (not the title)
- yea_means / nay_means: 1 sentence each
- yea_label / nay_label: 2–3 words each

Return structured tool input only. Never reply with markdown or conversational text.`;
}

function parseAnthropicVoteCard(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const toolBlock = blocks.find(
    (part) =>
      part?.type === "tool_use" &&
      (part.name === VOTE_CARD_TOOL.name || part?.input)
  );
  if (toolBlock?.input && typeof toolBlock.input === "object") {
    return toolBlock.input;
  }

  const text = blocks
    .filter((part) => part?.type === "text")
    .map((part) => part.text || "")
    .join("\n");
  return extractJsonObject(text);
}

async function formatVoteWithAnthropic({ title, rawText }) {
  const apiKey = env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY");
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY for vote formatting.");
  }

  const model = env("ANTHROPIC_MODEL", "CLAUDE_MODEL") || ANTHROPIC_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [VOTE_CARD_TOOL],
      tool_choice: { type: "tool", name: VOTE_CARD_TOOL.name },
      messages: [{ role: "user", content: buildUserPrompt(title, rawText) }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const parsed = parseAnthropicVoteCard(data);
  if (!parsed) {
    throw new Error("Anthropic returned non-JSON content.");
  }
  return normalizeCard(parsed, title);
}

async function formatVoteWithOpenAI({ title, rawText }) {
  const apiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for vote formatting.");
  }

  const base = (
    env("OPENAI_BASE_URL", "LLM_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env("OPENAI_MODEL", "LLM_MODEL") || OPENAI_MODEL;

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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(title, rawText) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("OpenAI returned non-JSON content.");
  }
  return normalizeCard(parsed, title);
}

/** Prefer Anthropic when set; otherwise OpenAI-compatible. */
async function formatVoteWithAI({ title, rawText }) {
  if (env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY")) {
    return formatVoteWithAnthropic({ title, rawText });
  }
  return formatVoteWithOpenAI({ title, rawText });
}

async function upsertProcessedVote(supabase, row) {
  const { data, error } = await supabase
    .from("processed_votes")
    .upsert(row, { onConflict: "roll_call_id" })
    .select("roll_call_id")
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Supabase upsert failed.");
  }
  return data;
}

function resolveChamberFilter(value) {
  const raw = String(value || "both").trim().toLowerCase();
  if (raw === "house" || raw === "senate" || raw === "both") return raw;
  return "both";
}

/**
 * @param {{
 *   limit?: number,
 *   congress?: number,
 *   skipExisting?: boolean,
 *   chamber?: "house" | "senate" | "both",
 * }} [options]
 */
async function syncVotes(options = {}) {
  const congressApiKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!congressApiKey) {
    throw new Error("Missing CONGRESS_API_KEY.");
  }

  const congress = Number(options.congress) || DEFAULT_CONGRESS;
  const limit = Math.min(
    MAX_SYNC_LIMIT,
    Math.max(1, Number(options.limit) || DEFAULT_LIMIT)
  );
  const skipExisting = options.skipExisting !== false;
  const chamber = resolveChamberFilter(options.chamber);

  const supabase = getSupabaseAdmin();

  // When syncing both chambers, split the limit roughly evenly.
  const houseLimit =
    chamber === "senate" ? 0 : chamber === "both" ? Math.ceil(limit / 2) : limit;
  const senateLimit =
    chamber === "house" ? 0 : chamber === "both" ? Math.floor(limit / 2) : limit;

  const mapped = [];
  if (houseLimit > 0) {
    const houseVotes = await fetchLatestHouseVotes(congressApiKey, {
      congress,
      limit: houseLimit,
    });
    mapped.push(...houseVotes);
  }
  if (senateLimit > 0) {
    const senateVotes = await fetchLatestSenateVotes({
      congress,
      limit: senateLimit,
    });
    mapped.push(...senateVotes);
  }

  mapped.sort((a, b) =>
    String(b.vote_date || "").localeCompare(String(a.vote_date || ""))
  );

  const results = {
    congress,
    chamber,
    fetched: mapped.length,
    fetched_house: mapped.filter((v) => v.chamber === "house").length,
    fetched_senate: mapped.filter((v) => v.chamber === "senate").length,
    upserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    ids: [],
  };

  for (const vote of mapped) {
    try {
      if (skipExisting) {
        const { data: existing, error: existingError } = await supabase
          .from("processed_votes")
          .select("roll_call_id")
          .eq("roll_call_id", vote.roll_call_id)
          .maybeSingle();
        if (existingError) {
          throw new Error(existingError.message || "Could not check existing vote.");
        }
        if (existing?.roll_call_id) {
          results.skipped += 1;
          continue;
        }
      }

      const crsText = await fetchBillSummaryText(vote, congressApiKey);
      const rawText = [crsText, vote.vote_question, vote.title]
        .filter(Boolean)
        .join("\n\n");
      const card = await formatVoteWithAI({
        title: vote.title,
        rawText,
      });

      const row = {
        ...vote,
        summary: card.summary,
        yea_means: card.yea_means,
        nay_means: card.nay_means,
        yea_label: card.yea_label,
        nay_label: card.nay_label,
        summary_source: "llm",
        updated_at: new Date().toISOString(),
      };

      await upsertProcessedVote(supabase, row);
      results.upserted += 1;
      results.ids.push(vote.roll_call_id);
    } catch (error) {
      results.failed += 1;
      results.errors.push({
        id: vote.roll_call_id,
        message: error.message || String(error),
      });
      console.warn("sync-votes item failed:", vote.roll_call_id, error);
    }
  }

  return results;
}

module.exports = {
  syncVotes,
  isExcludedVote,
  mapHouseVote,
  fetchLatestHouseVotes,
  formatVoteWithAI,
  formatVoteWithOpenAI,
  formatVoteWithAnthropic,
  DEFAULT_CONGRESS,
  DEFAULT_LIMIT,
  MAX_SYNC_LIMIT,
};
