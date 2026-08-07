#!/usr/bin/env node
/**
 * Quick verification for Article 1 bills-feed theme seeds.
 * Usage: node scripts/seed-article1-bills-feed.js
 */
const { seedFederalAndStateBills } = require("../lib/bills-feed-seed");

const items = seedFederalAndStateBills();
const byRoute = items.reduce((acc, item) => {
  const route = item.themeRoute || "unknown";
  acc[route] = acc[route] || [];
  acc[route].push(item.billNumber);
  return acc;
}, {});

console.log(`Article 1 theme seeds: ${items.length} federal/state bills`);
for (const [route, bills] of Object.entries(byRoute)) {
  console.log(`  ${route}: ${bills.join(", ")}`);
}
console.log(
  "Types: Finance → Bento, Judiciary → Editorial, Authorization → Pipeline, Regulation → Editorial"
);
console.log(
  "API: /api/bills-feed always merges these theme seeds (disable with ?seed=0)."
);
console.log("DB: npm run seed:article1-db upserts the same rows into processed_votes.");
