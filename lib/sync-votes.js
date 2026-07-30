/**
 * Sync House roll-call votes → Supabase `processed_votes`.
 * Shared by /api/sync-votes (Vercel) and app/api/sync-votes/route.ts (Next.js).
 */

const { createClient } = require("@supabase/supabase-js");

const CONGRESS_API = "https://api.congress.gov/v3";
const DEFAULT_CONGRESS = 119;
const DEFAULT_LIMIT = 40;
const OPENAI_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You write plain-English vote cards for a civic app.

Rules (strict):
1. Analyze ONLY the provided bill title + congressional text. Do not invent programs, repeals, bans, or funding cuts that are not clearly in the text.
2. Be SPECIFIC. Name the actual programs, funding, rules, or agencies when the text says so.
3. summary must be 1–2 COMPLETE sentences in plain English (no legalese).
4. yea_means / nay_means must be exactly 1 sentence each describing the real-world outcome of Yea vs Nay.
5. yea_label / nay_label must be 2–3 words, parallel, concrete (e.g. "End Rebates" / "Keep Rebates"). If unsure, use "Support Measure" / "Oppose Measure".
6. No slogans and no fear-mongering.

Return ONLY valid JSON with exactly these keys:
{
  "summary": string,
  "yea_means": string,
  "nay_means": string,
  "yea_label": string,
  "nay_label": string
}`;

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

  return {
    id: buildVoteId({
      congress,
      sessionNumber,
      rollCallNumber,
    }),
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

async function formatVoteWithOpenAI({ title, rawText }) {
  const apiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for vote formatting.");
  }

  const base = (
    env("OPENAI_BASE_URL", "LLM_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env("OPENAI_MODEL", "LLM_MODEL") || OPENAI_MODEL;

  const userPrompt = `Bill title: ${title || "Untitled measure"}

Raw congressional / CRS text:
"""
${String(rawText || "").slice(0, 6000) || "(No CRS summary available.)"}
"""

Produce the JSON card for the bill above.`;

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
        { role: "user", content: userPrompt },
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

async function upsertProcessedVote(supabase, row) {
  const { data, error } = await supabase
    .from("processed_votes")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Supabase upsert failed.");
  }
  return data;
}

/**
 * @param {{ limit?: number, congress?: number, skipExisting?: boolean }} [options]
 */
async function syncVotes(options = {}) {
  const congressApiKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!congressApiKey) {
    throw new Error("Missing CONGRESS_API_KEY.");
  }

  const congress = Number(options.congress) || DEFAULT_CONGRESS;
  const limit = Math.min(
    80,
    Math.max(1, Number(options.limit) || DEFAULT_LIMIT)
  );
  const skipExisting = options.skipExisting !== false;

  const supabase = getSupabaseAdmin();
  const mapped = await fetchLatestHouseVotes(congressApiKey, {
    congress,
    limit,
  });

  const results = {
    congress,
    fetched: mapped.length,
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
          .select("id")
          .eq("id", vote.id)
          .maybeSingle();
        if (existingError) {
          throw new Error(existingError.message || "Could not check existing vote.");
        }
        if (existing?.id) {
          results.skipped += 1;
          continue;
        }
      }

      const crsText = await fetchBillSummaryText(vote, congressApiKey);
      const rawText = [crsText, vote.vote_question, vote.title]
        .filter(Boolean)
        .join("\n\n");
      const card = await formatVoteWithOpenAI({
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
      results.ids.push(vote.id);
    } catch (error) {
      results.failed += 1;
      results.errors.push({
        id: vote.id,
        message: error.message || String(error),
      });
      console.warn("sync-votes item failed:", vote.id, error);
    }
  }

  return results;
}

module.exports = {
  syncVotes,
  isExcludedVote,
  mapHouseVote,
  formatVoteWithOpenAI,
  DEFAULT_CONGRESS,
  DEFAULT_LIMIT,
};
