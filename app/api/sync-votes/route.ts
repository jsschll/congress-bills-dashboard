import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONGRESS_API = "https://api.congress.gov/v3";
const DEFAULT_CONGRESS = 119;
const DEFAULT_LIMIT = 40;
const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

type VoteCard = {
  summary: string;
  yea_means: string;
  nay_means: string;
  yea_label: string;
  nay_label: string;
};

type HouseVoteRaw = {
  congress?: number;
  sessionNumber?: number;
  rollCallNumber?: number;
  legislationType?: string;
  legislationNumber?: string;
  legislationTitle?: string;
  voteQuestion?: string;
  result?: string;
  startDate?: string;
  date?: string;
  [key: string]: unknown;
};

type MappedVote = {
  roll_call_id: string;
  bill_id: string | null;
  congress: number;
  session_number: number;
  roll_call_number: number;
  chamber: "house";
  bill_type: string | null;
  bill_number: string | null;
  legislation_number: string | null;
  title: string;
  vote_question: string;
  result: string;
  vote_date: string | null;
  official_url: string;
  clerk_url: string;
  raw_payload: HouseVoteRaw;
};

type ProcessedVoteRow = MappedVote &
  VoteCard & {
    summary_source: string;
    updated_at: string;
  };

type SyncResult = {
  ok: boolean;
  congress: number;
  fetched: number;
  upserted: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
  ids: string[];
  error?: string;
};

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

function env(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function getSupabaseAdmin(): SupabaseClient {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw Object.assign(
      new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for processed_votes upsert."
      ),
      { statusCode: 500 }
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

function normalizeBillType(value: unknown): string {
  return String(value || "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Skip H.RES / S.RES and Motion to Table / Previous Question votes. */
function isExcludedVote(vote: HouseVoteRaw): boolean {
  const billType = normalizeBillType(vote.legislationType);
  if (billType === "HRES" || billType === "SRES") return true;

  const question = String(vote.voteQuestion || "");
  if (/motion to table/i.test(question)) return true;
  if (/previous question/i.test(question)) return true;
  return false;
}

function displayDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function mapHouseVote(raw: HouseVoteRaw): MappedVote {
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
    roll_call_id: `house-vote-${congress}-${sessionNumber}-${rollCallNumber}`,
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

async function fetchLatestHouseVotes(
  apiKey: string,
  congress: number,
  limit: number
): Promise<MappedVote[]> {
  const fetchLimit = Math.min(250, Math.max(limit * 3, limit));
  const url = `${CONGRESS_API}/house-vote/${congress}?format=json&limit=${fetchLimit}&api_key=${encodeURIComponent(
    apiKey
  )}`;
  const data = await fetchJson<{ houseRollCallVotes?: HouseVoteRaw[] }>(url);
  const votes = Array.isArray(data.houseRollCallVotes)
    ? data.houseRollCallVotes
    : [];

  return votes
    .filter((vote) => !isExcludedVote(vote))
    .slice(0, limit)
    .map(mapHouseVote);
}

async function fetchBillSummaryText(
  vote: MappedVote,
  apiKey: string
): Promise<string> {
  const type = normalizeBillType(vote.bill_type).toLowerCase();
  const number = vote.legislation_number;
  if (!type || !number) return "";

  try {
    const url = `${CONGRESS_API}/bill/${vote.congress}/${type}/${number}/summaries?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson<{
      summaries?: Array<{ text?: string }>;
    }>(url);
    const summaries = data.summaries || [];
    if (!summaries.length) return "";

    const best = summaries.reduce<({ text?: string } | null)>((current, item) => {
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
    console.warn(
      "CRS summary fetch failed:",
      error instanceof Error ? error.message : error
    );
    return "";
  }
}

function extractJsonObject(text: string): Partial<VoteCard> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<VoteCard>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Partial<VoteCard>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeCard(
  parsed: Partial<VoteCard> | null,
  fallbackTitle: string
): VoteCard {
  const summary = String(parsed?.summary || "").trim();
  const yea_means = String(parsed?.yea_means || "").trim();
  const nay_means = String(parsed?.nay_means || "").trim();
  const yea_label = String(parsed?.yea_label || "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  const nay_label = String(parsed?.nay_label || "")
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

function buildUserPrompt(title: string, rawText: string): string {
  return `Bill title: ${title || "Untitled measure"}

Raw congressional / CRS text:
"""
${String(rawText || "").slice(0, 6000) || "(No CRS summary available.)"}
"""

Produce the JSON card for the bill above.`;
}

async function formatVoteWithAnthropic(
  title: string,
  rawText: string
): Promise<VoteCard> {
  const apiKey = env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY");
  if (!apiKey) {
    throw Object.assign(
      new Error("Missing ANTHROPIC_API_KEY for vote formatting."),
      { statusCode: 500 }
    );
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
      max_tokens: 500,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(title, rawText) }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const content = Array.isArray(data?.content)
    ? data.content
        .filter((part) => part?.type === "text")
        .map((part) => part.text || "")
        .join("\n")
    : "";
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("Anthropic returned non-JSON content.");
  }
  return normalizeCard(parsed, title);
}

async function formatVoteWithOpenAI(
  title: string,
  rawText: string
): Promise<VoteCard> {
  const apiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
  if (!apiKey) {
    throw Object.assign(new Error("Missing OPENAI_API_KEY for vote formatting."), {
      statusCode: 500,
    });
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

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("OpenAI returned non-JSON content.");
  }
  return normalizeCard(parsed, title);
}

async function formatVoteWithAI(
  title: string,
  rawText: string
): Promise<VoteCard> {
  if (env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY")) {
    return formatVoteWithAnthropic(title, rawText);
  }
  return formatVoteWithOpenAI(title, rawText);
}

async function upsertProcessedVote(
  supabase: SupabaseClient,
  row: ProcessedVoteRow
): Promise<void> {
  const { error } = await supabase
    .from("processed_votes")
    .upsert(row, { onConflict: "roll_call_id" });
  if (error) {
    throw new Error(error.message || "Supabase upsert failed.");
  }
}

function assertAuthorized(request: Request): void {
  const secret = env("CRON_SECRET", "SYNC_VOTES_SECRET");
  if (!secret) return;

  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("secret") || "";
  if (token !== secret && queryToken !== secret) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

async function parseOptions(request: Request): Promise<{
  limit: number;
  congress: number;
  skipExisting: boolean;
}> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const limit = Math.min(
    80,
    Math.max(
      1,
      Number(url.searchParams.get("limit") || body.limit || DEFAULT_LIMIT)
    )
  );
  const congress =
    Number(url.searchParams.get("congress") || body.congress || DEFAULT_CONGRESS) ||
    DEFAULT_CONGRESS;
  const skipExistingRaw =
    url.searchParams.get("skipExisting") ?? body.skipExisting;
  const skipExisting =
    skipExistingRaw === undefined
      ? true
      : !(
          String(skipExistingRaw).toLowerCase() === "0" ||
          String(skipExistingRaw).toLowerCase() === "false"
        );

  return { limit, congress, skipExisting };
}

async function runSync(request: Request): Promise<Response> {
  try {
    assertAuthorized(request);

    const congressApiKey = env("CONGRESS_API_KEY", "API_KEY");
    if (!congressApiKey) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing CONGRESS_API_KEY.",
      } satisfies Partial<SyncResult>);
    }

    const { limit, congress, skipExisting } = await parseOptions(request);
    const supabase = getSupabaseAdmin();
    const mapped = await fetchLatestHouseVotes(congressApiKey, congress, limit);

    const result: SyncResult = {
      ok: true,
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
            .select("roll_call_id")
            .eq("roll_call_id", vote.roll_call_id)
            .maybeSingle();
          if (existingError) {
            throw new Error(
              existingError.message || "Could not check existing vote."
            );
          }
          if (existing?.roll_call_id) {
            result.skipped += 1;
            continue;
          }
        }

        const crsText = await fetchBillSummaryText(vote, congressApiKey);
        const rawText = [crsText, vote.vote_question, vote.title]
          .filter(Boolean)
          .join("\n\n");
        const card = await formatVoteWithAI(vote.title, rawText);

        const row: ProcessedVoteRow = {
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
        result.upserted += 1;
        result.ids.push(vote.roll_call_id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown sync item error";
        result.failed += 1;
        result.errors.push({ id: vote.roll_call_id, message });
        console.warn("sync-votes item failed:", vote.roll_call_id, error);
      }
    }

    return jsonResponse(200, result);
  } catch (error) {
    console.error("sync-votes failed:", error);
    const statusCode =
      typeof error === "object" &&
      error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    return jsonResponse(statusCode, {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not sync votes.",
    });
  }
}

export async function OPTIONS(): Promise<Response> {
  return jsonResponse(204, {});
}

export async function GET(request: Request): Promise<Response> {
  return runSync(request);
}

export async function POST(request: Request): Promise<Response> {
  return runSync(request);
}
