#!/usr/bin/env node
/**
 * Backfill Claude summaries for processed_votes rows that lack a real card.
 *
 * Targets rows where summary is null/empty, equals the title, or otherwise
 * matches the title string (not a real LLM write-up).
 *
 * Usage:
 *   node scripts/backfill-summaries.js
 *   node scripts/backfill-summaries.js --batch=20
 *   node scripts/backfill-summaries.js --max=5          # stop after N updates
 *   node scripts/backfill-summaries.js --dry-run
 *   node scripts/backfill-summaries.js --delay-ms=1000
 *
 * Loads keys from .env.local / .env, then process.env.
 * Loops in batches until no unsummarized rows remain (or --max is hit).
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

const SELECT_COLS = [
  "roll_call_id",
  "bill_id",
  "title",
  "summary",
  "yea_means",
  "nay_means",
  "yea_label",
  "nay_label",
  "bill_number",
  "legislation_number",
  "bill_type",
  "vote_question",
  "congress",
  "chamber",
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
 * True when the row still needs a Claude summary card.
 * - summary IS NULL / empty
 * - summary === title (exact or normalized)
 * - summary is a known fallback stub that just echoes the title
 */
function needsClaudeSummary(row = {}) {
  const summary = String(row.summary || "").trim();
  const title = String(row.title || "").trim();
  if (!summary) return true;
  if (title && summary === title) return true;

  const summaryNorm = normalizeComparable(summary);
  const titleNorm = normalizeComparable(title);
  if (titleNorm && summaryNorm === titleNorm) return true;

  // "This vote concerns <title>." fallback from normalizeCard
  if (/^this vote concerns\b/i.test(summary)) return true;
  if (/^this is a recent (house |senate )?roll-?call vote\.?$/i.test(summary)) {
    return true;
  }

  // Summary is basically just the title with trivial wrapping.
  if (
    titleNorm &&
    summaryNorm.includes(titleNorm) &&
    summaryNorm.length <= titleNorm.length + 24
  ) {
    return true;
  }

  return false;
}

function labelForRow(row = {}) {
  return (
    String(row.bill_number || "").trim() ||
    String(row.bill_id || "").trim() ||
    String(row.roll_call_id || "").trim() ||
    "unknown"
  );
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
  } = require("../lib/sync-votes");

  const congressApiKey =
    process.env.CONGRESS_API_KEY || process.env.API_KEY || "";
  const supabase = getSupabaseAdmin();

  console.log(
    `Backfilling Claude summaries (batch=${BATCH_SIZE}, delay=${DELAY_MS}ms${
      Number.isFinite(MAX_UPDATES) ? `, max=${MAX_UPDATES}` : ""
    }${DRY_RUN ? ", dry-run" : ""})…`
  );

  let totalDone = 0;
  let totalFailed = 0;
  let pass = 0;

  while (true) {
    pass += 1;
    const allRows = await fetchAllProcessedVotes(supabase);
    const pending = allRows.filter(needsClaudeSummary);

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
        const rawText = [crsText, row.vote_question, row.title]
          .filter(Boolean)
          .join("\n\n");
        const card = await formatVoteWithAI({
          title: row.title,
          rawText,
        });

        if (DRY_RUN) {
          console.log(
            `[${index}/${totalTarget}] (dry-run) Would summarize ${label}: ${String(
              card.summary || ""
            ).slice(0, 100)}…`
          );
        } else {
          const { error } = await supabase
            .from("processed_votes")
            .update({
              summary: card.summary,
              yea_means: card.yea_means,
              nay_means: card.nay_means,
              yea_label: card.yea_label,
              nay_label: card.nay_label,
              summary_source: "llm",
              updated_at: new Date().toISOString(),
            })
            .eq("roll_call_id", row.roll_call_id);

          if (error) {
            throw new Error(error.message || "Supabase update failed.");
          }

          console.log(`[${index}/${totalTarget}] Summarized ${label}…`);
        }

        totalDone += 1;
      } catch (error) {
        totalFailed += 1;
        console.warn(
          `[${totalDone + 1}/${totalTarget}] FAILED ${label}:`,
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

    // Brief pause between batch re-scans.
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        summarized: totalDone,
        failed: totalFailed,
        dryRun: DRY_RUN,
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
