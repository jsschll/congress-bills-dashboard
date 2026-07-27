#!/usr/bin/env node
/**
 * Import all published judge CSVs under data/ (skips templates/).
 * Used by GitHub Actions so friends see updates without local Node.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DATA_DIR = path.join(__dirname, "..", "data");

function listCsvFiles() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".csv"))
    .sort();

  const mapping = files.filter((name) => name.endsWith("-county-mapping.csv"));
  const statewide = files.filter((name) => name.endsWith("-statewide.csv"));
  const appellate = files.filter((name) => name.endsWith("-appellate.csv"));
  const local = files.filter((name) => name.endsWith("-local.csv"));

  return { mapping, statewide, appellate, local };
}

function run(script, file) {
  const absolute = path.join(DATA_DIR, file);
  console.log(`\n>>> ${script} ${file}`);
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, script), absolute],
    { stdio: "inherit", env: process.env }
  );
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const { mapping, statewide, appellate, local } = listCsvFiles();
  const all = [...mapping, ...statewide, ...appellate, ...local];
  if (!all.length) {
    console.error("No data/*-*.csv files found to import.");
    process.exit(1);
  }

  console.log("Publishing judge CSVs to Supabase:");
  console.log(all.map((f) => `  - ${f}`).join("\n"));

  for (const file of mapping) run("import-county-mapping.js", file);
  for (const file of statewide) run("import-state-officials.js", file);
  for (const file of appellate) run("import-state-officials.js", file);
  for (const file of local) run("import-state-officials.js", file);

  console.log("\n>>> coverage-report.js TX");
  const coverage = spawnSync(
    process.execPath,
    [path.join(__dirname, "coverage-report.js"), "TX"],
    { stdio: "inherit", env: process.env }
  );
  if (coverage.status !== 0) process.exit(coverage.status || 1);

  console.log("\nPublished. Friends can hard-refresh the live site.");
}

main();
