const fs = require("fs");

/** Minimal RFC4180-ish CSV parser (no dependency). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => String(h || "").trim());
  return rows
    .slice(1)
    .filter((cells) => cells.some((c) => String(c || "").trim() !== ""))
    .map((cells) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = cells[index] != null ? String(cells[index]).trim() : "";
      });
      return obj;
    });
}

function readCsvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseCsv(text.replace(/^\uFEFF/, ""));
}

/** Parse "1|14" or "1;14" or "1,14" into integer array. */
function parseIntList(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  }
  return String(value)
    .split(/[|;,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part.replace(/\D/g, "") || part))
    .filter((n) => Number.isFinite(n));
}

function parseOptionalInt(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/\D/g, "") || value);
  return Number.isFinite(n) ? n : null;
}

function normalizeCountyName(value) {
  return String(value || "")
    .replace(/\s+county$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  parseCsv,
  readCsvFile,
  parseIntList,
  parseOptionalInt,
  normalizeCountyName,
};
