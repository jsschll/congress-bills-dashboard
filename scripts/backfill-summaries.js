#!/usr/bin/env node
/**
 * Backfill Claude summaries for processed_votes rows that lack a real card.
 *
 * Targets rows where summary is null/empty, equals the title, or is a known
 * stub ("This vote concerns…"). Writes the full Action Match field set when
 * Claude returns it (short_title, plain_summary, card_summary, impacts, etc.).
 *
 * Usage:
 *   node scripts/backfill-summaries.js
 *   node scripts/backfill-summaries.js --batch=20
 *   node scripts/backfill-summaries.js --max=5
 *   node scripts/backfill-summaries.js --dry-run
 *   node scripts/backfill-summaries.js --delay-ms=1000
 *   node scripts/backfill-summaries.js --kind=bill   # bill | vote | all
 *
 * Loads keys from .env.local / .env. Loops in batches until no candidates
 * remain (or --max is hit).
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

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const BATCH_SIZE = Math.max(1, Math.min(50, Number(getArg("batch", 20)) || 20));
const DELAY_MS = Math.max(0, Number(getArg("delay-ms", 1000)) || 0);
const MAX_UPDATES = (() => {
  const raw = getArg("max", "");
  if (raw === "" || raw == null) return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
})();
const DRY_RUN =
  args.includes("--dry-run") ||
  String(getArg("dry-run", "0")).toLowerCase() === "1" ||
  String(getArg("dry-run", "0")).toLowerCase() === "true";
const KIND = String(getArg("kind", "all")).toLowerCase();

const SELECT_COLS = [
  "roll_call_id",
  "bill_id",
  "title",
  "summary",
  "yea_means",
  "nay_means",
  "yea_label",
  "nay_label",
  "short_title",
  "plain_summary",
  "card_summary",
  "takeaway",
  "key_points",
  "pro_argument",
  "con_argument",
  "yea_impact",
  "nay_impact",
  "primary_category",
  "is_key_vote",
  "bill_number",
  "legislation_number",
  "bill_type",
  "vote_question",
  "vote_kind",
  "congress",
  "chamber",
  "session_number",
  "roll_call_number",
  "summary_source",
  "updated_at",
].join(",");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the row still needs a Claude quality refresh for Action Match.
 * - summary IS NULL / empty / stub / UNKNOWN
 * - summary === title
 * - missing Action Match breakdown fields (short_title / takeaway / key_points)
 * - oversized card text (>40 words) that likely dumped CRS into the UI
 * - known jargon leftover in the card
 */
function needsClaudeSummary(row = {}) {
  const summary = String(row.summary || "").trim();
  const card = String(
    row.card_summary || row.plain_summary || row.summary || ""
  ).trim();
  const title = String(row.title || "").trim();
  const shortTitle = String(row.short_title || "").trim();
  const takeaway = String(row.takeaway || "").trim();
  const pro = String(row.pro_argument || "").trim();
  const keyPoints = row.key_points;

  if (!summary && !card) return true;
  if (/^<?\s*unknown\s*>?$/i.test(summary) || /^<?\s*unknown\s*>?$/i.test(card)) {
    return true;
  }
  if (title && summary === title) return true;

  const summaryNorm = normalizeComparable(summary || card);
  const titleNorm = normalizeComparable(title);
  if (titleNorm && summaryNorm === titleNorm) return true;

  if (/^this vote concerns\b/i.test(summary) || /^this vote concerns\b/i.test(card)) {
    return true;
  }
  if (/^this is a recent (house |senate )?roll-?call vote\.?$/i.test(summary)) {
    return true;
  }
  if (/^unknown\b/i.test(summary) || /^unknown\b/i.test(card)) return true;

  // Summary is basically just the title with trivial wrapping
  // (e.g. "Title." or "On Title") — not "This vote is about Title…".
  if (
    titleNorm &&
    summaryNorm === titleNorm
  ) {
    return true;
  }
  if (
    titleNorm &&
    (summaryNorm === `on ${titleNorm}` ||
      summaryNorm === `about ${titleNorm}` ||
      summaryNorm.startsWith(`${titleNorm} `)) &&
    summaryNorm.length <= titleNorm.length + 16
  ) {
    return true;
  }

  // Incomplete Action Match cards from older syncs.
  if (!shortTitle || isUnknownClaudeValue(shortTitle)) return true;
  if (!takeaway || isUnknownClaudeValue(takeaway)) return true;
  if (!pro || isUnknownClaudeValue(pro)) return true;

  let points = [];
  if (Array.isArray(keyPoints)) {
    points = keyPoints;
  } else if (typeof keyPoints === "string" && keyPoints.trim()) {
    try {
      const parsed = JSON.parse(keyPoints);
      if (Array.isArray(parsed)) points = parsed;
    } catch {
      points = [];
    }
  }
  const cleanPoints = points
    .map((p) => String(p || "").trim())
    .filter((p) => p && !isUnknownClaudeValue(p));
  if (cleanPoints.length < 3) return true;

  const words = card.split(/\s+/).filter(Boolean).length;
  if (words > 40) return true;

  if (
    /\b(appropriations|reconciliation|pursuant to|title [ivx]+|weams|notwithstanding|provided that|procedural motion)\b/i.test(
      card
    )
  ) {
    return true;
  }

  // Orphan roll calls with no bill metadata can't be improved further once
  // they already have a short non-stub card — avoid infinite re-queues.
  const hasBill =
    String(row.bill_type || "").trim() &&
    String(row.legislation_number || row.bill_number || "").trim();
  if (
    !hasBill &&
    shortTitle &&
    !isUnknownClaudeValue(takeaway) &&
    cleanPoints.length >= 3 &&
    words <= 40
  ) {
    return false;
  }

  return false;
}

function isUnknownClaudeValue(value = "") {
  return /^<?\s*unknown\s*>?$/i.test(String(value || "").replace(/\s+/g, " ").trim());
}

function matchesKind(row = {}) {
  const kind = String(row.vote_kind || "").toLowerCase();
  if (KIND === "all" || !KIND) return true;
  if (KIND === "bill") return kind === "bill";
  if (KIND === "vote") return kind !== "bill";
  return true;
}

function labelForRow(row = {}) {
  return (
    String(row.bill_number || "").trim() ||
    String(row.bill_id || "").trim() ||
    String(row.roll_call_id || "").trim() ||
    "unknown"
  );
}

function scrubUnknown(value) {
  const text = String(value || "").trim();
  if (!text || isUnknownClaudeValue(text)) return "";
  return text;
}

function buildUpdatePayload(card = {}) {
  const plain =
    scrubUnknown(card.plain_summary) ||
    scrubUnknown(card.card_summary) ||
    scrubUnknown(card.summary) ||
    null;
  const payload = {
    summary: scrubUnknown(card.summary) || plain,
    yea_means: scrubUnknown(card.yea_means) || null,
    nay_means: scrubUnknown(card.nay_means) || null,
    yea_label: scrubUnknown(card.yea_label) || null,
    nay_label: scrubUnknown(card.nay_label) || null,
    summary_source: "llm",
    updated_at: new Date().toISOString(),
  };

  const shortTitle = scrubUnknown(card.short_title);
  if (shortTitle) payload.short_title = shortTitle;
  if (plain) {
    payload.plain_summary = plain;
    payload.card_summary = scrubUnknown(card.card_summary) || plain;
    payload.what_it_does = scrubUnknown(card.what_it_does) || plain;
  }
  if (scrubUnknown(card.yea_impact)) payload.yea_impact = scrubUnknown(card.yea_impact);
  if (scrubUnknown(card.nay_impact)) payload.nay_impact = scrubUnknown(card.nay_impact);
  const takeaway = scrubUnknown(card.takeaway) || shortTitle;
  if (takeaway) payload.takeaway = takeaway;
  if (scrubUnknown(card.pro_argument)) payload.pro_argument = scrubUnknown(card.pro_argument);
  if (scrubUnknown(card.con_argument)) payload.con_argument = scrubUnknown(card.con_argument);
  if (Array.isArray(card.key_points)) {
    const points = card.key_points
      .map((p) => scrubUnknown(p))
      .filter(Boolean);
    if (points.length) payload.key_points = points;
  } else if (card.key_points) {
    payload.key_points = card.key_points;
  }
  if (scrubUnknown(card.primary_category)) {
    payload.primary_category = scrubUnknown(card.primary_category);
  }
  if (typeof card.is_key_vote === "boolean") {
    payload.is_key_vote = card.is_key_vote;
  } else if (card.is_key_vote != null) {
    payload.is_key_vote = card.is_key_vote === true;
  }

  return payload;
}

async function fetchAllProcessedVotes(supabase) {
  const pageSize = 200;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("processed_votes")
      .select(SELECT_COLS)
      .order("vote_date", { ascending: false })
      .range(from, to);
    if (error) {
      throw new Error(error.message || "Could not load processed_votes.");
    }
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const missing = [];
  if (!process.env.CONGRESS_API_KEY && !process.env.API_KEY) {
    missing.push("CONGRESS_API_KEY (or API_KEY)");
  }
  if (
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.CLAUDE_API_KEY &&
    !process.env.OPENAI_API_KEY
  ) {
    missing.push("ANTHROPIC_API_KEY (or OPENAI_API_KEY)");
  }
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length) {
    console.error("Missing required secrets in .env.local:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error(
      "\nAdd them to .env.local, then re-run: node scripts/backfill-summaries.js"
    );
    process.exit(1);
  }

  const {
    getSupabaseAdmin,
    fetchBillSummaryText,
    formatVoteWithAI,
    buildClaudeVoteContext,
    fetchParentBillContext,
  } = require("../lib/sync-votes");

  const congressApiKey =
    process.env.CONGRESS_API_KEY || process.env.API_KEY || "";
  const supabase = getSupabaseAdmin();

  console.log(
    `Backfilling Claude summaries (batch=${BATCH_SIZE}, delay=${DELAY_MS}ms, kind=${KIND}${
      Number.isFinite(MAX_UPDATES) ? `, max=${MAX_UPDATES}` : ""
    }${DRY_RUN ? ", dry-run" : ""})…`
  );

  let totalDone = 0;
  let totalFailed = 0;
  let pass = 0;

  while (true) {
    pass += 1;
    const allRows = await fetchAllProcessedVotes(supabase);
    const pending = allRows.filter(
      (row) => matchesKind(row) && needsClaudeSummary(row)
    );

    if (!pending.length) {
      if (pass === 1) {
        console.log(
          `No unsummarized rows found (${allRows.length} processed_votes checked).`
        );
      } else {
        console.log(
          `Done. ${totalDone} summarized, ${totalFailed} failed. 0 unsummarized remain.`
        );
      }
      break;
    }

    const remainingCap = Number.isFinite(MAX_UPDATES)
      ? Math.max(0, MAX_UPDATES - totalDone)
      : pending.length;
    if (remainingCap <= 0) {
      console.log(
        `Hit --max=${MAX_UPDATES}. ${pending.length} unsummarized still remain.`
      );
      break;
    }

    const batch = pending.slice(0, Math.min(BATCH_SIZE, remainingCap));
    const totalTarget = Math.min(
      pending.length,
      Number.isFinite(MAX_UPDATES) ? MAX_UPDATES : pending.length
    );

    console.log(
      `\nPass ${pass}: ${pending.length} unsummarized — processing ${batch.length}…`
    );

    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      const index = totalDone + i + 1;
      const label = labelForRow(row);

      try {
        const crsText = await fetchBillSummaryText(row, congressApiKey);
        let card;
        const isBillRow = String(row.vote_kind || "").toLowerCase() === "bill";

        if (!isBillRow && typeof buildClaudeVoteContext === "function") {
          let parent = null;
          try {
            if (typeof fetchParentBillContext === "function") {
              parent = await fetchParentBillContext(row, congressApiKey);
            }
          } catch (parentError) {
            console.warn(
              `  parent context skipped for ${label}:`,
              parentError.message || parentError
            );
          }
          const context = buildClaudeVoteContext(
            {
              ...row,
              summaryText: crsText || null,
            },
            parent
          );
          card = await formatVoteWithAI(context);
        } else {
          const rawText = [crsText, row.vote_question, row.title]
            .filter(Boolean)
            .join("\n\n");
          card = await formatVoteWithAI({
            title: row.title,
            rawText,
          });
        }

        if (DRY_RUN) {
          console.log(
            `[${index}/${totalTarget}] (dry-run) Would summarize ${label}: ${String(
              card.summary || card.plain_summary || ""
            ).slice(0, 100)}…`
          );
          totalDone += 1;
        } else {
          const payload = buildUpdatePayload(card);
          const { error } = await supabase
            .from("processed_votes")
            .update(payload)
            .eq("roll_call_id", row.roll_call_id);

          if (error) {
            throw new Error(error.message || "Supabase update failed.");
          }

          console.log(`[${index}/${totalTarget}] Summarized ${label}…`);
          totalDone += 1;
        }
      } catch (error) {
        totalFailed += 1;
        console.warn(
          `[${index}/${totalTarget}] FAILED ${label}:`,
          error.message || error
        );
      }

      if (DELAY_MS > 0 && i < batch.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    if (DRY_RUN) {
      console.log(
        `Dry-run complete for one batch (${batch.length}). Re-run without --dry-run to write.`
      );
      break;
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        summarized: totalDone,
        failed: totalFailed,
        dryRun: DRY_RUN,
        kind: KIND,
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
