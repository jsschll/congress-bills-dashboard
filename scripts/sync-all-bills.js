#!/usr/bin/env node
/**
 * Ingest all Congress.gov bills for a congress into Supabase `bills`
 * (falls back to `bill_items` if migration-bills.sql has not been applied).
 *
 * Pagination: GET /v3/bill/{congress}?limit=250&offset=…
 * Upsert: bill_id, title, type, number, originChamber, updateDate, sponsor, status
 * Summaries: use official CRS text when useful; otherwise Claude via lib/sync-votes.js
 *
 * Usage:
 *   node scripts/sync-all-bills.js
 *   node scripts/sync-all-bills.js --congress=119
 *   node scripts/sync-all-bills.js --max=50
 *   node scripts/sync-all-bills.js --max=50 --skip-summarize
 *   node scripts/sync-all-bills.js --offset=1000 --max=250
 *
 * Loads keys from .env.local / .env.
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filename) {
  const full = path.join(process.cwd(), filename);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const CONGRESS_API = "https://api.congress.gov/v3";
const PAGE_LIMIT = 250;
const CLAUDE_CHUNK = 10;
const DEFAULT_CONGRESS = 119;

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const CONGRESS = Number(getArg("congress", DEFAULT_CONGRESS)) || DEFAULT_CONGRESS;
const START_OFFSET = Math.max(0, Number(getArg("offset", 0)) || 0);
const MAX_BILLS = (() => {
  const raw = getArg("max", "");
  if (raw === "" || raw == null) return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
})();
const DELAY_MS = Math.max(0, Number(getArg("delay-ms", 1000)) || 0);
const SKIP_SUMMARIZE =
  args.includes("--skip-summarize") ||
  String(getArg("skip-summarize", "0")).toLowerCase() === "1" ||
  String(getArg("skip-summarize", "0")).toLowerCase() === "true";
const FORCE_CLAUDE =
  args.includes("--force-claude") ||
  String(getArg("force-claude", "0")).toLowerCase() === "1" ||
  String(getArg("force-claude", "0")).toLowerCase() === "true";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
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
    .toUpperCase()
    .replace(/\./g, "")
    .trim();
}

function billIdFromParts(type, number) {
  const t = normalizeType(type);
  const n = String(number || "").trim();
  return `${t} ${n}`.trim();
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericSummary(summary, title) {
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
  if (/^this (bill|act|resolution) (is|would be|provides for)\b/i.test(text) && text.length < 80) {
    return true;
  }
  return false;
}

async function fetchOfficialSummary(congress, type, number, apiKey) {
  const t = normalizeType(type).toLowerCase();
  const n = String(number || "").trim();
  if (!t || !n) return "";
  try {
    const url = `${CONGRESS_API}/bill/${congress}/${t}/${n}/summaries?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson(url);
    const summaries = data.summaries || [];
    if (!summaries.length) return "";
    const best = summaries.reduce((current, item) => {
      const currentText = stripHtml(current?.text || "");
      const itemText = stripHtml(item?.text || "");
      if (!current) return item;
      return itemText.length > currentText.length ? item : current;
    }, null);
    return stripHtml(best?.text || "");
  } catch (error) {
    console.warn(
      `Summary fetch failed for ${normalizeType(type)} ${number}:`,
      error.message || error
    );
    return "";
  }
}

async function fetchSponsor(congress, type, number, apiKey) {
  const t = normalizeType(type).toLowerCase();
  const n = String(number || "").trim();
  if (!t || !n) return "";
  try {
    const url = `${CONGRESS_API}/bill/${congress}/${t}/${n}?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson(url);
    const sponsor = data.bill?.sponsors?.[0] || {};
    return String(sponsor.fullName || sponsor.name || "").trim();
  } catch {
    return "";
  }
}

async function resolveTarget(supabase) {
  const probe = await supabase.from("bills").select("bill_id").limit(1);
  if (!probe.error) {
    return { table: "bills", mode: "bills" };
  }
  console.warn(
    "Table public.bills not found. Falling back to bill_items. Run supabase/migration-bills.sql in the Supabase SQL editor for the dedicated bills table."
  );
  const items = await supabase.from("bill_items").select("id").limit(1);
  if (items.error) {
    throw new Error(
      `Neither bills nor bill_items is writable: ${items.error.message}`
    );
  }
  return { table: "bill_items", mode: "bill_items" };
}

function toBillsRow(mapped) {
  return {
    bill_id: mapped.bill_id,
    congress: mapped.congress,
    title: mapped.title,
    type: mapped.type,
    number: mapped.number,
    origin_chamber: mapped.origin_chamber,
    update_date: mapped.update_date,
    sponsor: mapped.sponsor || null,
    status: mapped.status || null,
    official_summary: mapped.official_summary || null,
    summary: mapped.summary || null,
    yea_means: mapped.yea_means || null,
    nay_means: mapped.nay_means || null,
    yea_label: mapped.yea_label || null,
    nay_label: mapped.nay_label || null,
    summary_source: mapped.summary_source || null,
    official_url: mapped.official_url,
    raw_payload: mapped.raw_payload || {},
    updated_at: new Date().toISOString(),
  };
}

function toBillItemsRow(mapped) {
  const typeLower = mapped.type.toLowerCase();
  return {
    id: `federal-${mapped.congress}-${typeLower}-${mapped.number}`.toLowerCase(),
    bill_number: mapped.bill_id,
    title: mapped.title,
    level: "Federal",
    jurisdiction:
      String(mapped.origin_chamber || "").toLowerCase() === "senate"
        ? "U.S. Senate"
        : "U.S. House",
    government_source: "congress.gov",
    primary_sponsor_name: mapped.sponsor || "Sponsor unavailable",
    primary_sponsor_title: "",
    last_updated: mapped.update_date
      ? new Date(`${mapped.update_date}T12:00:00`).toISOString()
      : new Date().toISOString(),
    status_step_name: mapped.status || "Updated",
    short_pitch: mapped.summary || mapped.official_summary || mapped.title,
    official_url: mapped.official_url,
    metadata: {
      bill_id: mapped.bill_id,
      type: mapped.type,
      number: mapped.number,
      congress: mapped.congress,
      originChamber: mapped.origin_chamber,
      summary_source: mapped.summary_source,
      official_summary: mapped.official_summary,
      yea_means: mapped.yea_means,
      nay_means: mapped.nay_means,
      yea_label: mapped.yea_label,
      nay_label: mapped.nay_label,
      latestAction: mapped.raw_payload?.latestAction || null,
    },
    updated_at: new Date().toISOString(),
  };
}

async function upsertMapped(supabase, mode, mapped) {
  if (mode === "bills") {
    const { error } = await supabase
      .from("bills")
      .upsert(toBillsRow(mapped), { onConflict: "bill_id" });
    if (error) throw new Error(error.message || "bills upsert failed");
    return;
  }
  const { error } = await supabase
    .from("bill_items")
    .upsert(toBillItemsRow(mapped), { onConflict: "id" });
  if (error) throw new Error(error.message || "bill_items upsert failed");
}

async function mapListBill(bill, apiKey, { fetchSponsorName = true } = {}) {
  const congress = Number(bill.congress || CONGRESS);
  const type = normalizeType(bill.type);
  const number = String(bill.number || "").trim();
  const title = String(bill.title || "").trim() || "Untitled bill";
  const originChamber = String(bill.originChamber || "").trim() || null;
  const updateDate = String(bill.updateDate || "").slice(0, 10) || null;
  const status = String(bill.latestAction?.text || "").trim() || null;
  const billId = billIdFromParts(type, number);
  const officialUrl = `https://www.congress.gov/bill/${congress}th-congress/${type.toLowerCase()}/${number}`;

  const [officialSummary, sponsor] = await Promise.all([
    SKIP_SUMMARIZE
      ? Promise.resolve("")
      : fetchOfficialSummary(congress, type, number, apiKey),
    fetchSponsorName
      ? fetchSponsor(congress, type, number, apiKey)
      : Promise.resolve(""),
  ]);

  const needsClaude =
    !SKIP_SUMMARIZE &&
    (FORCE_CLAUDE || isGenericSummary(officialSummary, title));

  return {
    bill_id: billId,
    congress,
    title,
    type,
    number,
    origin_chamber: originChamber,
    update_date: updateDate,
    sponsor: sponsor || null,
    status,
    official_summary: officialSummary || null,
    summary: needsClaude ? null : officialSummary || null,
    yea_means: null,
    nay_means: null,
    yea_label: null,
    nay_label: null,
    summary_source: needsClaude
      ? null
      : officialSummary
        ? "crs"
        : null,
    official_url: officialUrl,
    raw_payload: bill,
    needsClaude,
  };
}

async function summarizeWithClaude(mapped, formatVoteWithAI) {
  const rawText = [
    mapped.official_summary,
    mapped.status,
    mapped.title,
  ]
    .filter(Boolean)
    .join("\n\n");
  const card = await formatVoteWithAI({
    title: mapped.title,
    rawText,
  });
  mapped.summary = card.summary;
  mapped.yea_means = card.yea_means;
  mapped.nay_means = card.nay_means;
  mapped.yea_label = card.yea_label;
  mapped.nay_label = card.nay_label;
  mapped.summary_source = "llm";
  return mapped;
}

async function processClaudeQueue(queue, supabase, mode, formatVoteWithAI, totals) {
  for (let i = 0; i < queue.length; i += CLAUDE_CHUNK) {
    const chunk = queue.slice(i, i + CLAUDE_CHUNK);
    for (let j = 0; j < chunk.length; j += 1) {
      const mapped = chunk[j];
      const index = mapped._index || totals.completed;
      try {
        await summarizeWithClaude(mapped, formatVoteWithAI);
        await upsertMapped(supabase, mode, mapped);
        console.log(
          `[${index}/${totals.totalLabel}] Ingested ${mapped.bill_id} - Summarized via Claude`
        );
        totals.claude += 1;
      } catch (error) {
        totals.failed += 1;
        console.warn(
          `[${index}/${totals.totalLabel}] FAILED Claude ${mapped.bill_id}:`,
          error.message || error
        );
      }
      if (DELAY_MS > 0 && j < chunk.length - 1) await sleep(DELAY_MS);
    }
    if (DELAY_MS > 0 && i + CLAUDE_CHUNK < queue.length) await sleep(DELAY_MS);
  }
}

async function main() {
  const missing = [];
  if (!env("CONGRESS_API_KEY", "API_KEY")) {
    missing.push("CONGRESS_API_KEY (or API_KEY)");
  }
  if (
    !env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY") &&
    !env("OPENAI_API_KEY") &&
    !SKIP_SUMMARIZE
  ) {
    missing.push("ANTHROPIC_API_KEY (or OPENAI_API_KEY) — or pass --skip-summarize");
  }
  if (!env("SUPABASE_URL")) missing.push("SUPABASE_URL");
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.error("Missing required secrets in .env.local:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error("\nRe-run: node scripts/sync-all-bills.js");
    process.exit(1);
  }

  const {
    getSupabaseAdmin,
    formatVoteWithAI,
  } = require("../lib/sync-votes");

  const apiKey = env("CONGRESS_API_KEY", "API_KEY");
  const supabase = getSupabaseAdmin();
  const { mode } = await resolveTarget(supabase);

  console.log(
    `Syncing Congress ${CONGRESS} bills → ${mode} (page=${PAGE_LIMIT}, claudeChunk=${CLAUDE_CHUNK}, delay=${DELAY_MS}ms${
      Number.isFinite(MAX_BILLS) ? `, max=${MAX_BILLS}` : ""
    }${SKIP_SUMMARIZE ? ", skip-summarize" : ""})…`
  );

  let offset = START_OFFSET;
  let totalCount = null;
  const totals = {
    ingested: 0,
    completed: 0,
    crs: 0,
    claude: 0,
    failed: 0,
    totalLabel: "?",
  };

  while (true) {
    if (Number.isFinite(MAX_BILLS) && totals.ingested >= MAX_BILLS) break;

    const remaining = Number.isFinite(MAX_BILLS)
      ? MAX_BILLS - totals.ingested
      : PAGE_LIMIT;
    const limit = Math.min(PAGE_LIMIT, remaining);
    const url = `${CONGRESS_API}/bill/${CONGRESS}?limit=${limit}&offset=${offset}&format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson(url);
    const bills = Array.isArray(data.bills) ? data.bills : [];
    if (totalCount == null) {
      totalCount = Number(data.pagination?.count) || null;
      totals.totalLabel = Number.isFinite(MAX_BILLS)
        ? String(Math.min(MAX_BILLS, totalCount || MAX_BILLS))
        : String(totalCount || "?");
      console.log(
        `Congress.gov reports ${totalCount ?? "?"} bills for congress ${CONGRESS}.`
      );
    }

    if (!bills.length) break;

    const claudeQueue = [];

    for (const bill of bills) {
      if (Number.isFinite(MAX_BILLS) && totals.ingested >= MAX_BILLS) break;
      totals.ingested += 1;
      totals.completed = totals.ingested;

      try {
        const mapped = await mapListBill(bill, apiKey, {
          // Sponsor detail call is expensive at full scale; still fetch when summarizing
          // or for smaller capped runs.
          fetchSponsorName:
            !SKIP_SUMMARIZE ||
            (Number.isFinite(MAX_BILLS) && MAX_BILLS <= 500),
        });

        if (mapped.needsClaude) {
          // Persist shell row first, then queue Claude rewrite.
          mapped._index = totals.completed;
          await upsertMapped(supabase, mode, mapped);
          claudeQueue.push(mapped);
          console.log(
            `[${totals.completed}/${totals.totalLabel}] Ingested ${mapped.bill_id} - Queued for Claude`
          );
        } else {
          await upsertMapped(supabase, mode, mapped);
          if (mapped.summary_source === "crs") totals.crs += 1;
          console.log(
            `[${totals.completed}/${totals.totalLabel}] Ingested ${mapped.bill_id} - ${
              mapped.summary_source === "crs"
                ? "Official summary kept"
                : "Saved without summary"
            }`
          );
        }
      } catch (error) {
        totals.failed += 1;
        const label = billIdFromParts(bill.type, bill.number);
        console.warn(
          `[${totals.completed}/${totals.totalLabel}] FAILED ${label}:`,
          error.message || error
        );
      }

      // Light pause between per-bill Congress.gov detail/summary calls.
      if (DELAY_MS > 0) await sleep(Math.min(DELAY_MS, 250));
    }

    if (claudeQueue.length) {
      await processClaudeQueue(
        claudeQueue,
        supabase,
        mode,
        formatVoteWithAI,
        totals
      );
    }

    offset += bills.length;
    if (bills.length < limit) break;
    if (totalCount != null && offset >= totalCount) break;
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        congress: CONGRESS,
        table: mode,
        ingested: totals.ingested,
        officialSummaries: totals.crs,
        claudeSummaries: totals.claude,
        failed: totals.failed,
        offsetEnd: offset,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
