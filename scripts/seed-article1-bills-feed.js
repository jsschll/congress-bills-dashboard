#!/usr/bin/env node
/**
 * Quick verification / documentation for Article 1 bills-feed seed fallback.
 * Usage: node scripts/seed-article1-bills-feed.js
 *
 * When Congress.gov / OpenStates keys are missing and processed_votes is empty,
 * /api/bills-feed automatically returns these federal/state examples so Bento
 * Grid (finance/budget) and Editorial Collage (education/health) can be verified.
 */
const { seedFederalAndStateBills } = require("../lib/bills-feed-seed");

const items = seedFederalAndStateBills();
const byTheme = {
  bento: items.filter((item) =>
    /finance|budget|economy|tax|appropriations/i.test(
      [item.category, item.primaryCategory, ...(item.tags || [])].join(" ")
    )
  ),
  pipeline: items.filter((item) =>
    /procedural|tracking|floor debate|final passage|cloture/i.test(
      [
        item.category,
        item.primaryCategory,
        item.statusLabel,
        item.voteKind,
        ...(item.tags || []),
      ].join(" ")
    )
  ),
  editorial: items.filter(
    (item) =>
      !/finance|budget|economy|tax|appropriations/i.test(
        [item.category, item.primaryCategory, ...(item.tags || [])].join(" ")
      ) &&
      !/procedural|tracking|floor debate|final passage|cloture/i.test(
        [
          item.category,
          item.primaryCategory,
          item.statusLabel,
          item.voteKind,
          ...(item.tags || []),
        ].join(" ")
      )
  ),
};

console.log(`Article 1 seed fallback: ${items.length} federal/state bills`);
console.log(`  Bento (finance/budget): ${byTheme.bento.map((i) => i.billNumber).join(", ")}`);
console.log(
  `  Pipeline (procedural): ${byTheme.pipeline.map((i) => i.billNumber).join(", ")}`
);
console.log(
  `  Editorial (social/education/health): ${byTheme.editorial
    .map((i) => i.billNumber)
    .join(", ")}`
);
console.log(
  "API behavior: /api/bills-feed serves these automatically when live federal/state sources are empty (disable with ?seed=0)."
);
