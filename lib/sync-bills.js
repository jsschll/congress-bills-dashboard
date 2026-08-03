/**
 * Sync Congress.gov bills → Supabase `processed_votes`.
 * Used by scripts/sync-all-bills.js and /api/cron-sync-bills.
 *
 * Bill rows use roll_call_id = `bill-{congress}-{type}-{number}` and a
 * synthetic session_number (>=100) so they do not collide with real roll calls.
 */

const {
  getSupabaseAdmin,
  fetchBillSummaryText,
  formatVoteWithAI,
  formatVoteWithAnthropic,
  DEFAULT_CONGRESS,
} = require("./sync-votes");

const CONGRESS_API = "https://api.congress.gov/v3";
const PAGE_LIMIT = 250;
const BILL_SESSION_BASE = 100;
const TYPE_SESSION_OFFSET = {
  hr: 0,
  s: 1,
  hjres: 2,
  sjres: 3,
  hconres: 4,
  sconres: 5,
  hres: 6,
  sres: 7,
};

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function normalizeType(type) {
  return String(type || "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();
}

function displayBillNumber(type, number) {
  const t = String(type || "")
    .toUpperCase()
    .replace(/\./g, "");
  return `${t} ${String(number || "").trim()}`.trim();
}

function billRollCallId(congress, type, number) {
  return `bill-${Number(congress)}-${normalizeType(type)}-${String(
    number || ""
  ).trim()}`;
}

function syntheticSessionNumber(type) {
  const offset = TYPE_SESSION_OFFSET[normalizeType(type)];
  return BILL_SESSION_BASE + (Number.isFinite(offset) ? offset : 9);
}

function chamberFromOrigin(originChamber) {
  return /senate/i.test(String(originChamber || "")) ? "senate" : "house";
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lacksSummary(row = {}, title = "") {
  const summary = String(row?.summary || "").trim();
  if (!summary) return true;
  const titleNorm = normalizeComparable(title || row.title || "");
  const summaryNorm = normalizeComparable(summary);
  if (titleNorm && summaryNorm === titleNorm) return true;
  if (/^this vote concerns\b/i.test(summary)) return true;
  if (/^this is a recent (house |senate )?roll-?call vote\.?$/i.test(summary)) {
    return true;
  }
  if (
    titleNorm &&
    summaryNorm.includes(titleNorm) &&
    summaryNorm.length <= titleNorm.length + 24
  ) {
    return true;
  }
  return false;
}

function isGenericOfficialSummary(summary, title) {
  const text = String(summary || "").trim();
  if (!text) return true;
  if (text.length < 40) return true;
  const titleNorm = normalizeComparable(title);
  const summaryNorm = normalizeComparable(text);
  if (titleNorm && summaryNorm === titleNorm) return true;
  if (
    titleNorm &&
    summaryNorm.includes(titleNorm) &&
    summaryNorm.length <= titleNorm.length + 24
  ) {
    return true;
  }
  return false;
}

function mapBillToProcessedRow(bill, card = null, extras = {}) {
  const congress = Number(bill.congress || extras.congress || DEFAULT_CONGRESS);
  const type = normalizeType(bill.type);
  const number = String(bill.number || "").trim();
  const title = String(bill.title || "").trim() || "Untitled bill";
  const chamber = chamberFromOrigin(bill.originChamber || extras.originChamber);
  const billNumber = displayBillNumber(type, number);
  const updateDate = String(bill.updateDate || "").slice(0, 10) || null;
  const status = String(bill.latestAction?.text || extras.status || "").trim();

  const row = {
    roll_call_id: billRollCallId(congress, type, number),
    bill_id: billNumber,
    congress,
    session_number: syntheticSessionNumber(type),
    roll_call_number: Number(number) || 0,
    chamber,
    bill_type: type,
    bill_number: billNumber,
    legislation_number: number,
    title,
    vote_question: status || title,
    result: status || null,
    vote_date: updateDate,
    vote_kind: "bill",
    official_url: `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`,
    clerk_url: null,
    summary_source: extras.summary_source || null,
    raw_payload: {
      source: "congress.gov/bill",
      bill,
      originChamber: bill.originChamber || null,
      sponsor: extras.sponsor || null,
    },
    updated_at: new Date().toISOString(),
  };

  if (card) {
    row.summary = card.summary;
    row.yea_means = card.yea_means;
    row.nay_means = card.nay_means;
    row.yea_label = card.yea_label;
    row.nay_label = card.nay_label;
    row.summary_source = extras.summary_source || "llm";
  } else if (extras.summary) {
    row.summary = extras.summary;
    row.yea_means = extras.yea_means || null;
    row.nay_means = extras.nay_means || null;
    row.yea_label = extras.yea_label || null;
    row.nay_label = extras.nay_label || null;
    row.summary_source = extras.summary_source || "crs";
  }

  return row;
}

async function findExistingBillRow(supabase, congress, type, number) {
  const rollCallId = billRollCallId(congress, type, number);
  const { data, error } = await supabase
    .from("processed_votes")
    .select(
      "roll_call_id, title, summary, yea_means, nay_means, yea_label, nay_label, summary_source"
    )
    .eq("roll_call_id", rollCallId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Could not read processed_votes.");
  }
  return data || null;
}

/** Reuse a Claude/CRS card already stored for this legislation (e.g. from a roll call). */
async function findExistingLegislationSummary(supabase, congress, type, number) {
  const { data, error } = await supabase
    .from("processed_votes")
    .select(
      "summary, yea_means, nay_means, yea_label, nay_label, summary_source, vote_kind, vote_date"
    )
    .eq("congress", Number(congress))
    .eq("bill_type", normalizeType(type))
    .eq("legislation_number", String(number))
    .not("summary", "is", null)
    .order("vote_date", { ascending: false })
    .limit(12);
  if (error) {
    console.warn("legislation summary lookup failed:", error.message || error);
    return null;
  }
  const rows = (data || []).filter((row) => !lacksSummary(row));
  if (!rows.length) return null;
  const finalPassage = rows.find(
    (row) => String(row.vote_kind || "").toLowerCase() === "final_passage"
  );
  return finalPassage || rows[0];
}

async function upsertProcessedBill(supabase, row) {
  const { error } = await supabase
    .from("processed_votes")
    .upsert(row, { onConflict: "roll_call_id" });
  if (error) {
    throw new Error(error.message || "processed_votes upsert failed.");
  }
}

async function summarizeBill({ title, officialSummary, status }) {
  const rawText = [officialSummary, status, title].filter(Boolean).join("\n\n");
  // Prefer Anthropic when configured (explicit path requested); else formatVoteWithAI.
  if (env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY")) {
    return formatVoteWithAnthropic({ title, rawText });
  }
  return formatVoteWithAI({ title, rawText });
}

/**
 * Process one Congress.gov list bill into processed_votes.
 * @returns {{ status: 'skipped'|'crs'|'reused'|'claude'|'failed', billId: string, message?: string }}
 */
async function processOneBill(bill, supabase, congressApiKey, options = {}) {
  const congress = Number(bill.congress || options.congress || DEFAULT_CONGRESS);
  const type = normalizeType(bill.type);
  const number = String(bill.number || "").trim();
  const title = String(bill.title || "").trim() || "Untitled bill";
  const billId = displayBillNumber(type, number);
  const force = options.force === true;

  if (!type || !number) {
    return { status: "failed", billId: billId || "unknown", message: "Missing type/number" };
  }

  const existing = await findExistingBillRow(supabase, congress, type, number);
  if (!force && existing && !lacksSummary(existing, title)) {
    return { status: "skipped", billId };
  }

  // Prefer an existing Claude/CRS card for this legislation (from a prior vote sync).
  if (!force) {
    const reused = await findExistingLegislationSummary(
      supabase,
      congress,
      type,
      number
    );
    if (reused && !lacksSummary(reused, title)) {
      const row = mapBillToProcessedRow(bill, null, {
        congress,
        summary: reused.summary,
        yea_means: reused.yea_means,
        nay_means: reused.nay_means,
        yea_label: reused.yea_label,
        nay_label: reused.nay_label,
        summary_source: reused.summary_source || "reused",
      });
      await upsertProcessedBill(supabase, row);
      return { status: "reused", billId };
    }
  }

  const officialSummary = await fetchBillSummaryText(
    {
      congress,
      bill_type: type,
      legislation_number: number,
    },
    congressApiKey
  );

  if (!force && !isGenericOfficialSummary(officialSummary, title)) {
    const row = mapBillToProcessedRow(bill, null, {
      congress,
      summary: officialSummary,
      summary_source: "crs",
    });
    await upsertProcessedBill(supabase, row);
    return { status: "crs", billId };
  }

  const card = await summarizeBill({
    title,
    officialSummary,
    status: bill.latestAction?.text || "",
  });
  const row = mapBillToProcessedRow(bill, card, {
    congress,
    summary_source: "llm",
  });
  await upsertProcessedBill(supabase, row);
  return { status: "claude", billId };
}

/**
 * Paginate Congress.gov bills and upsert into processed_votes.
 *
 * @param {{
 *   congress?: number,
 *   max?: number,
 *   offset?: number,
 *   delayMs?: number,
 *   force?: boolean,
 *   log?: boolean,
 * }} [options]
 */
async function syncAllBills(options = {}) {
  const congressApiKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!congressApiKey) throw new Error("Missing CONGRESS_API_KEY.");

  const congress = Number(options.congress) || DEFAULT_CONGRESS;
  const max = Number.isFinite(Number(options.max))
    ? Math.max(1, Number(options.max))
    : Infinity;
  const delayMs =
    options.delayMs === undefined ? 1000 : Math.max(0, Number(options.delayMs) || 0);
  const force = options.force === true;
  const log = options.log !== false;
  let offset = Math.max(0, Number(options.offset) || 0);

  const supabase = getSupabaseAdmin();
  const results = {
    congress,
    fetched: 0,
    skipped: 0,
    crs: 0,
    reused: 0,
    claude: 0,
    failed: 0,
    errors: [],
    totalAvailable: null,
  };

  while (results.fetched < max) {
    const pageSize = Math.min(PAGE_LIMIT, Number.isFinite(max) ? max - results.fetched : PAGE_LIMIT);
    const url = `${CONGRESS_API}/bill/${congress}?limit=${pageSize}&offset=${offset}&format=json&api_key=${encodeURIComponent(
      congressApiKey
    )}`;
    const data = await fetchJson(url);
    const bills = Array.isArray(data.bills) ? data.bills : [];
    if (results.totalAvailable == null) {
      results.totalAvailable = Number(data.pagination?.count) || null;
      if (log) {
        console.log(
          `Congress.gov reports ${results.totalAvailable ?? "?"} bills for congress ${congress}.`
        );
      }
    }
    if (!bills.length) break;

    const totalLabel = Number.isFinite(max)
      ? String(Math.min(max, results.totalAvailable || max))
      : String(results.totalAvailable || "?");

    for (const bill of bills) {
      if (results.fetched >= max) break;
      results.fetched += 1;
      const index = results.fetched;

      try {
        const outcome = await processOneBill(bill, supabase, congressApiKey, {
          congress,
          force,
        });
        if (outcome.status === "skipped") {
          results.skipped += 1;
          if (log) {
            console.log(
              `[${index}/${totalLabel}] ${outcome.billId} - Already summarized, skipped`
            );
          }
        } else if (outcome.status === "crs") {
          results.crs += 1;
          if (log) {
            console.log(
              `[${index}/${totalLabel}] Ingested ${outcome.billId} - Official CRS summary`
            );
          }
        } else if (outcome.status === "reused") {
          results.reused += 1;
          if (log) {
            console.log(
              `[${index}/${totalLabel}] Ingested ${outcome.billId} - Reused existing summary`
            );
          }
        } else if (outcome.status === "claude") {
          results.claude += 1;
          if (log) {
            console.log(
              `[${index}/${totalLabel}] Ingested ${outcome.billId} - Summarized via Claude`
            );
          }
        } else {
          results.failed += 1;
          results.errors.push({
            id: outcome.billId,
            message: outcome.message || "failed",
          });
          if (log) {
            console.warn(
              `[${index}/${totalLabel}] FAILED ${outcome.billId}: ${outcome.message}`
            );
          }
        }
      } catch (error) {
        results.failed += 1;
        const label = displayBillNumber(bill.type, bill.number);
        results.errors.push({
          id: label,
          message: error.message || String(error),
        });
        if (log) {
          console.warn(
            `[${index}/${totalLabel}] FAILED ${label}:`,
            error.message || error
          );
        }
      }

      if (delayMs > 0) await sleep(delayMs);
    }

    offset += bills.length;
    if (bills.length < pageSize) break;
    if (
      results.totalAvailable != null &&
      offset >= results.totalAvailable
    ) {
      break;
    }
  }

  results.offsetEnd = offset;
  return results;
}

/**
 * Cron-friendly: process the most recently updated bills only.
 * @param {{ congress?: number, limit?: number, delayMs?: number, force?: boolean, log?: boolean }} [options]
 */
async function syncRecentBills(options = {}) {
  const limit = Math.min(
    PAGE_LIMIT,
    Math.max(1, Number(options.limit) || 40)
  );
  return syncAllBills({
    congress: options.congress,
    max: limit,
    offset: 0,
    delayMs: options.delayMs === undefined ? 1000 : options.delayMs,
    force: options.force,
    log: options.log,
  });
}

module.exports = {
  syncAllBills,
  syncRecentBills,
  processOneBill,
  billRollCallId,
  lacksSummary,
  PAGE_LIMIT,
  DEFAULT_CONGRESS,
};
