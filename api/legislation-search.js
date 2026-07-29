const CONGRESS_API = "https://api.congress.gov/v3";
const GOVINFO_SEARCH = "https://api.govinfo.gov/search";
const FR_API = "https://www.federalregister.gov/api/v1/documents.json";
const FR_DOC = "https://www.federalregister.gov/api/v1/documents";
const DEFAULT_CONGRESS = 119;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

const BILL_TYPE_ALIASES = {
  hr: "hr",
  h: "hr",
  house: "hr",
  s: "s",
  sen: "s",
  senate: "s",
  hjres: "hjres",
  hj: "hjres",
  sjres: "sjres",
  sj: "sjres",
  hconres: "hconres",
  hc: "hconres",
  sconres: "sconres",
  sc: "sconres",
  hres: "hres",
  sres: "sres",
};

const BILL_TYPE_LABEL = {
  hr: "H.R.",
  s: "S.",
  hjres: "H.J.Res.",
  sjres: "S.J.Res.",
  hconres: "H.Con.Res.",
  sconres: "S.Con.Res.",
  hres: "H.Res.",
  sres: "S.Res.",
};

const CONGRESS_PATH_TYPE = {
  hr: "house-bill",
  s: "senate-bill",
  hjres: "house-joint-resolution",
  sjres: "senate-joint-resolution",
  hconres: "house-concurrent-resolution",
  sconres: "senate-concurrent-resolution",
  hres: "house-resolution",
  sres: "senate-resolution",
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status} for ${url}: ${text.slice(0, 180)}`);
  }
  return response.json();
}

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

function parseTypes(raw) {
  const allowed = new Set(["bill", "law", "regulation"]);
  const parts = String(raw || "bill,law,regulation")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => allowed.has(part));
  return parts.length ? [...new Set(parts)] : ["bill", "law", "regulation"];
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentences(text, max = 2) {
  const parts = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, max).join(" ");
}

function congressOrdinal(congress) {
  const n = Number(congress);
  const mod100 = n % 100;
  const mod10 = n % 10;
  let suffix = "th";
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = "st";
    else if (mod10 === 2) suffix = "nd";
    else if (mod10 === 3) suffix = "rd";
  }
  return `${n}${suffix}`;
}

function billDisplayNumber(type, number) {
  const label = BILL_TYPE_LABEL[type] || String(type || "").toUpperCase();
  return `${label} ${number}`.trim();
}

function congressBillUrl(congress, type, number) {
  const pathType = CONGRESS_PATH_TYPE[type] || type;
  return `https://www.congress.gov/bill/${congressOrdinal(congress)}-congress/${pathType}/${number}`;
}

function parseBillReference(query) {
  const normalized = String(query || "")
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  const match = normalized.match(
    /^(?:(\d{2,4})\s+)?(HR|H|HOUSE|S|SEN|SENATE|HJRES|HJ|SJRES|SJ|HCONRES|HC|SCONRES|SC|HRES|SRES)\s*(\d+)$/i
  );
  if (!match) return null;
  const typeKey = String(match[2] || "").toLowerCase();
  const type = BILL_TYPE_ALIASES[typeKey];
  if (!type) return null;
  return {
    congress: match[1] ? Number(match[1]) : DEFAULT_CONGRESS,
    type,
    number: String(match[3]),
  };
}

function parsePublicLawReference(query) {
  const normalized = String(query || "").trim().replace(/\s+/g, " ");
  const match = normalized.match(
    /^(?:pub(?:lic)?\.?\s*l(?:aw)?\.?|p\.?\s*l\.?)\s*(\d{2,4})[-\u2013](\d+)$/i
  );
  if (!match) return null;
  return {
    congress: Number(match[1]),
    number: String(match[2]),
  };
}

function parseFrDocumentNumber(query) {
  const normalized = String(query || "").trim();
  const direct = normalized.match(/^(\d{4}-\d{4,5})$/);
  if (direct) return direct[1];
  const frCite = normalized.match(/^(\d{2,3})\s*FR\s*(\d+)$/i);
  if (frCite) return null;
  return null;
}

function parseGovInfoBillPackage(packageId) {
  const match = String(packageId || "").match(
    /^BILLS-(\d{2,3})(hr|s|hjres|sjres|hconres|sconres|hres|sres)(\d+)/i
  );
  if (!match) return null;
  return {
    congress: Number(match[1]),
    type: match[2].toLowerCase(),
    number: String(match[3]),
  };
}

function parseGovInfoLawPackage(packageId) {
  const match = String(packageId || "").match(/^PLAW-(\d{2,3})publ(\d+)$/i);
  if (!match) return null;
  return {
    congress: Number(match[1]),
    number: String(match[2]),
  };
}

async function govInfoSearch(apiKey, query, pageSize) {
  const data = await fetchJson(`${GOVINFO_SEARCH}?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      pageSize,
      offsetMark: "*",
    }),
  });
  return data.results || [];
}

async function fetchCongressBill(apiKey, congress, type, number) {
  const url = `${CONGRESS_API}/bill/${congress}/${type}/${number}?format=json&api_key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url);
  return data.bill || null;
}

async function fetchCongressLaw(apiKey, congress, lawNumber) {
  const url = `${CONGRESS_API}/law/${congress}/pub/${lawNumber}?format=json&api_key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url);
  return data.bill || null;
}

function normalizeBillItem(bill, extras = {}) {
  const type = String(bill.type || extras.type || "").toLowerCase();
  const number = String(bill.number || extras.number || "");
  const congress = Number(bill.congress || extras.congress || DEFAULT_CONGRESS);
  const actionText = bill.latestAction?.text || extras.actionText || "";
  const actionDate =
    bill.latestAction?.actionDate || bill.updateDate || extras.dateIssued || "";
  const laws = bill.laws || [];
  const lawLabel = laws[0]
    ? `${laws[0].type || "Public Law"} ${laws[0].number}`
    : extras.lawLabel || "";

  return {
    id: `federal-bill-${congress}-${type}-${number}`.toLowerCase(),
    docType: "bill",
    docTypeLabel: "Bill",
    level: "Federal",
    jurisdiction: "U.S. Congress",
    billNumber: billDisplayNumber(type, number),
    title: bill.title || extras.title || "Untitled bill",
    shortPitch:
      extras.shortPitch ||
      toSentences(actionText, 1) ||
      "Federal legislation from Congress.gov.",
    lastUpdated: actionDate
      ? new Date(`${String(actionDate).slice(0, 10)}T12:00:00`).toISOString()
      : null,
    statusLabel: actionText || "Introduced",
    officialUrl:
      bill.legislationUrl ||
      congressBillUrl(congress, type, number),
    pdfUrl: extras.pdfUrl || "",
    meta: {
      congress,
      chamber: bill.originChamber || extras.chamber || "",
      lawLabel,
      source: extras.source || "congress.gov",
    },
    tags: extras.tags || ["Federal", "Bill"],
  };
}

function normalizeLawItem({ congress, number, title, dateIssued, actionText, bill, pdfUrl }) {
  const lawLabel = `Pub. L. ${congress}-${number}`;
  const type = bill ? String(bill.type || "").toLowerCase() : "";
  const billNumber = bill ? billDisplayNumber(type, bill.number) : "";
  return {
    id: `federal-law-${congress}-pub-${number}`.toLowerCase(),
    docType: "law",
    docTypeLabel: "Enacted Law",
    level: "Federal",
    jurisdiction: "United States",
    billNumber: lawLabel,
    title: title || bill?.title || `Public Law ${congress}-${number}`,
    shortPitch:
      toSentences(actionText || bill?.latestAction?.text || "", 1) ||
      (billNumber
        ? `Enacted as ${lawLabel} (originating bill ${billNumber}).`
        : `Enacted federal public law ${lawLabel}.`),
    lastUpdated: dateIssued
      ? new Date(`${String(dateIssued).slice(0, 10)}T12:00:00`).toISOString()
      : bill?.latestAction?.actionDate
        ? new Date(`${bill.latestAction.actionDate}T12:00:00`).toISOString()
        : null,
    statusLabel: "Became law",
    officialUrl: bill
      ? bill.legislationUrl ||
        congressBillUrl(bill.congress || congress, type, bill.number)
      : `https://www.govinfo.gov/app/details/PLAW-${congress}publ${number}`,
    pdfUrl: pdfUrl || "",
    meta: {
      congress,
      chamber: bill?.originChamber || "",
      lawLabel,
      originatingBill: billNumber,
      source: "congress.gov / govinfo",
    },
    tags: ["Federal", "Enacted Law"],
  };
}

function normalizeRegulationItem(doc) {
  const agencies = (doc.agencies || [])
    .map((agency) => agency.name || agency.raw_name)
    .filter(Boolean);
  const typeLabel =
    doc.type === "Proposed Rule"
      ? "Proposed Rule"
      : doc.type === "Rule"
        ? "Final Rule"
        : doc.type || "Regulation";
  return {
    id: `federal-reg-${doc.document_number}`.toLowerCase(),
    docType: "regulation",
    docTypeLabel: "Agency Regulation",
    level: "Federal",
    jurisdiction: agencies[0] || "Federal agency",
    billNumber: doc.document_number || "",
    title: doc.title || "Untitled regulation",
    shortPitch:
      toSentences(stripHtml(doc.abstract || ""), 2) ||
      `${typeLabel} published in the Federal Register.`,
    lastUpdated: doc.publication_date
      ? new Date(`${doc.publication_date}T12:00:00`).toISOString()
      : null,
    statusLabel: typeLabel,
    officialUrl: doc.html_url || "",
    pdfUrl: doc.pdf_url || "",
    meta: {
      agencies,
      documentNumber: doc.document_number || "",
      type: doc.type || "",
      source: "federalregister.gov",
    },
    tags: ["Federal", "Regulation", typeLabel, ...agencies.slice(0, 2)],
  };
}

async function searchBills(apiKey, query, limit) {
  const citation = parseBillReference(query);
  if (citation) {
    try {
      const bill = await fetchCongressBill(
        apiKey,
        citation.congress,
        citation.type,
        citation.number
      );
      return bill ? [normalizeBillItem(bill, { source: "congress.gov citation" })] : [];
    } catch {
      return [];
    }
  }

  const escaped = String(query).replace(/"/g, "").trim();
  if (!escaped) return [];

  const results = await govInfoSearch(
    apiKey,
    `collection:(BILLS) AND (${escaped})`,
    Math.min(50, limit * 4)
  );

  const seen = new Set();
  const items = [];
  for (const result of results) {
    const parsed = parseGovInfoBillPackage(result.packageId);
    if (!parsed) continue;
    const key = `${parsed.congress}-${parsed.type}-${parsed.number}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let bill = null;
    try {
      bill = await fetchCongressBill(
        apiKey,
        parsed.congress,
        parsed.type,
        parsed.number
      );
    } catch {
      bill = null;
    }

    items.push(
      normalizeBillItem(bill || parsed, {
        congress: parsed.congress,
        type: parsed.type,
        number: parsed.number,
        title: bill?.title || result.title,
        dateIssued: result.dateIssued,
        pdfUrl: result.download?.pdfLink || "",
        source: "govinfo + congress.gov",
        shortPitch: bill?.latestAction?.text
          ? toSentences(bill.latestAction.text, 1)
          : "Matching federal bill text from GovInfo.",
      })
    );
    if (items.length >= limit) break;
  }
  return items;
}

async function searchLaws(apiKey, query, limit) {
  const citation = parsePublicLawReference(query);
  if (citation) {
    try {
      const bill = await fetchCongressLaw(apiKey, citation.congress, citation.number);
      return [
        normalizeLawItem({
          congress: citation.congress,
          number: citation.number,
          title: bill?.title,
          actionText: bill?.latestAction?.text,
          bill,
          pdfUrl: `https://www.govinfo.gov/content/pkg/PLAW-${citation.congress}publ${citation.number}/pdf/PLAW-${citation.congress}publ${citation.number}.pdf`,
        }),
      ];
    } catch {
      return [
        normalizeLawItem({
          congress: citation.congress,
          number: citation.number,
        }),
      ];
    }
  }

  // Bill citations that became law still belong in bills; skip here unless Pub. L.
  if (parseBillReference(query)) return [];

  const escaped = String(query).replace(/"/g, "").trim();
  if (!escaped) return [];

  const results = await govInfoSearch(
    apiKey,
    `collection:(PLAW) AND (${escaped})`,
    Math.min(40, limit * 3)
  );

  const items = [];
  for (const result of results) {
    const parsed = parseGovInfoLawPackage(result.packageId);
    if (!parsed) continue;

    let bill = null;
    try {
      bill = await fetchCongressLaw(apiKey, parsed.congress, parsed.number);
    } catch {
      bill = null;
    }

    items.push(
      normalizeLawItem({
        congress: parsed.congress,
        number: parsed.number,
        title: result.title || bill?.title,
        dateIssued: result.dateIssued,
        actionText: bill?.latestAction?.text,
        bill,
        pdfUrl: result.download?.pdfLink || "",
      })
    );
    if (items.length >= limit) break;
  }
  return items;
}

async function searchRegulations(query, limit) {
  const docNumber = parseFrDocumentNumber(query);
  if (docNumber) {
    try {
      const doc = await fetchJson(`${FR_DOC}/${encodeURIComponent(docNumber)}.json`);
      return [normalizeRegulationItem(doc)];
    } catch {
      return [];
    }
  }

  if (parseBillReference(query) || parsePublicLawReference(query)) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("per_page", String(limit));
  params.set("order", "relevance");
  params.set("conditions[term]", query);
  params.append("conditions[type][]", "RULE");
  params.append("conditions[type][]", "PRORULE");
  for (const field of [
    "document_number",
    "title",
    "type",
    "abstract",
    "html_url",
    "pdf_url",
    "publication_date",
    "agencies",
  ]) {
    params.append("fields[]", field);
  }

  const data = await fetchJson(`${FR_API}?${params.toString()}`);
  return (data.results || []).slice(0, limit).map(normalizeRegulationItem);
}

async function browseRecent(apiKey, types, limit) {
  const results = { bills: [], laws: [], regulations: [] };

  if (types.includes("bill")) {
    try {
      const data = await fetchJson(
        `${CONGRESS_API}/bill/${DEFAULT_CONGRESS}?limit=${limit}&sort=updateDate+desc&format=json&api_key=${encodeURIComponent(apiKey)}`
      );
      results.bills = (data.bills || [])
        .slice(0, limit)
        .map((bill) => normalizeBillItem(bill, { source: "congress.gov recent" }));
    } catch (error) {
      results.billsError = error.message;
    }
  }

  if (types.includes("law")) {
    try {
      const data = await fetchJson(
        `${CONGRESS_API}/law/${DEFAULT_CONGRESS}?limit=${limit}&format=json&api_key=${encodeURIComponent(apiKey)}`
      );
      results.laws = (data.bills || []).slice(0, limit).map((bill) => {
        const law = (bill.laws || [])[0] || {};
        const [congressPart, numberPart] = String(law.number || "").split("-");
        return normalizeLawItem({
          congress: Number(congressPart) || bill.congress || DEFAULT_CONGRESS,
          number: numberPart || String(law.number || bill.number || ""),
          title: bill.title,
          actionText: bill.latestAction?.text,
          bill,
        });
      });
    } catch (error) {
      results.lawsError = error.message;
    }
  }

  if (types.includes("regulation")) {
    try {
      const params = new URLSearchParams();
      params.set("per_page", String(limit));
      params.set("order", "newest");
      params.append("conditions[type][]", "RULE");
      params.append("conditions[type][]", "PRORULE");
      for (const field of [
        "document_number",
        "title",
        "type",
        "abstract",
        "html_url",
        "pdf_url",
        "publication_date",
        "agencies",
      ]) {
        params.append("fields[]", field);
      }
      const data = await fetchJson(`${FR_API}?${params.toString()}`);
      results.regulations = (data.results || [])
        .slice(0, limit)
        .map(normalizeRegulationItem);
    } catch (error) {
      results.regulationsError = error.message;
    }
  }

  return results;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url, "http://localhost");
  // Prefer Vercel env; fall back to client config.js API_KEY (already used by Bills/Feed).
  const apiKey =
    process.env.CONGRESS_API_KEY ||
    process.env.API_KEY ||
    String(url.searchParams.get("api_key") || "").trim();
  if (!apiKey) {
    json(res, 500, {
      error:
        "Missing Congress.gov API key. Set CONGRESS_API_KEY on Vercel, or API_KEY in config.js.",
    });
    return;
  }

  const query = String(url.searchParams.get("q") || "").trim();
  const types = parseTypes(url.searchParams.get("types"));
  const limit = clampLimit(url.searchParams.get("limit"));

  try {
    if (!query) {
      const browse = await browseRecent(apiKey, types, limit);
      const items = [
        ...(browse.bills || []),
        ...(browse.laws || []),
        ...(browse.regulations || []),
      ].sort((a, b) => {
        const aTime = a.lastUpdated ? Date.parse(a.lastUpdated) : 0;
        const bTime = b.lastUpdated ? Date.parse(b.lastUpdated) : 0;
        return bTime - aTime;
      });

      json(res, 200, {
        query: "",
        mode: "browse",
        types,
        count: items.length,
        items,
        coverage: {
          bills: "live (Congress.gov)",
          laws: "live (Congress.gov / GovInfo)",
          regulations: "live (Federal Register)",
          location: "coming soon",
          stateLocal: "coming soon",
        },
        errors: {
          bills: browse.billsError || null,
          laws: browse.lawsError || null,
          regulations: browse.regulationsError || null,
        },
      });
      return;
    }

    const tasks = [];
    if (types.includes("bill")) {
      tasks.push(
        searchBills(apiKey, query, limit)
          .then((items) => ({ key: "bills", items }))
          .catch((error) => ({ key: "bills", items: [], error: error.message }))
      );
    }
    if (types.includes("law")) {
      tasks.push(
        searchLaws(apiKey, query, limit)
          .then((items) => ({ key: "laws", items }))
          .catch((error) => ({ key: "laws", items: [], error: error.message }))
      );
    }
    if (types.includes("regulation")) {
      tasks.push(
        searchRegulations(query, limit)
          .then((items) => ({ key: "regulations", items }))
          .catch((error) => ({
            key: "regulations",
            items: [],
            error: error.message,
          }))
      );
    }

    const settled = await Promise.all(tasks);
    const bucket = { bills: [], laws: [], regulations: [] };
    const errors = { bills: null, laws: null, regulations: null };
    for (const result of settled) {
      bucket[result.key] = result.items || [];
      errors[result.key] = result.error || null;
    }

    const citation =
      parseBillReference(query) ||
      parsePublicLawReference(query) ||
      (parseFrDocumentNumber(query) ? { fr: parseFrDocumentNumber(query) } : null);

    const items = [...bucket.bills, ...bucket.laws, ...bucket.regulations];

    json(res, 200, {
      query,
      mode: citation ? "citation" : "keyword",
      types,
      count: items.length,
      items,
      groups: {
        bills: bucket.bills.length,
        laws: bucket.laws.length,
        regulations: bucket.regulations.length,
      },
      coverage: {
        bills: "live (GovInfo + Congress.gov)",
        laws: "live (GovInfo PLAW + Congress.gov)",
        regulations: "live (Federal Register)",
        location: "coming soon",
        stateLocal: "coming soon",
      },
      errors,
    });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message || "Search failed" });
  }
};
