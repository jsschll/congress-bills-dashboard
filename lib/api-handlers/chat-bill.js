/**
 * Ask AI about a bill — streams a plain-English answer grounded in bill context.
 * Served at /api/chat-bill via api/format-bill-summary.js multiplex.
 *
 * When the client only sends a thin feed card (title + legislative status),
 * we enrich from processed_votes and/or Congress.gov CRS summaries before answering.
 */

const {
  fetchParentBillContext,
  getSupabaseAdmin,
  DEFAULT_CONGRESS,
} = require("../sync-votes");

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";
const CRS_CONTEXT_MAX_CHARS = 7000;

const BILL_SYSTEM_PROMPT = `You are an expert, objective legislative analyst assistant embedded inside a bill details interface. Your primary duty is to help users quickly understand legislation, extract details, and navigate official resources efficiently and neutrally.

### CORE OPERATING RULES:

1. CONTEXT INTEGRATION & DEPTH:
   - Always analyze the full bill context provided in the payload (including CRS / official summaries, card summaries, takeaways, key points, funding mechanics, and metadata).
   - Legislative status lines (e.g. "received in the Senate", "referred to committee") are procedural metadata — NOT a substitute for policy content. Prefer Summary / Official CRS summary / Key points when explaining what the bill does.
   - If a user asks specific policy or financial questions (e.g., "How is this funded?" or "What are the specific requirements?"), inspect the loaded payload thoroughly before answering.
   - NEVER tell the user you lack the bill text, ask them to paste the bill, or refuse analysis when a Summary or Official CRS summary is present. Answer from that context.
   - Only say a detail is unavailable after checking the full payload. Then say what is known and optionally link Congress.gov — do not make opening Congress.gov a prerequisite for a useful answer.

2. DIRECT LINKS & RESOURCES:
   - Always provide the official direct link when requested or relevant.
   - Use the \`bill.congress_url\` field passed in the metadata to output clean, clickable Markdown links (e.g., [Official Congress.gov Page](url)).
   - Never say "I don't have direct access to internet links" if the URL is provided in the bill metadata.

3. OUTSIDE CIVIC & LEGISLATIVE KNOWLEDGE:
   - When users ask general structural or procedural questions (e.g., "How do unfunded mandates work?", "What is HHS authorization?", "Where do I check roll call votes?"), you MAY draw on general civic and legislative knowledge.
   - For specific details of THIS bill (e.g., exact dollar amounts, dates, co-sponsors), rely on the provided context. If a detail is absent from the context (e.g., no specific appropriation is attached to the bill), explicitly state: "The bill text does not authorize specific new appropriations; execution relies on existing agency administrative budgets unless funded in subsequent appropriations."

4. TONALITY & BOUNDARIES:
   - Remain helpful, informative, and neutral.
   - Avoid overly defensive hedging (e.g., avoid repeating "As an AI..." or "Based solely on the brief text..." or "Based on the metadata provided...").
   - Answer directly first, followed by necessary nuance or context.
   - Do not invent provisions that are not supported by the provided context.`;

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    if (typeof req.body === "string" && req.body.trim()) {
      try {
        resolve(JSON.parse(req.body));
      } catch (error) {
        reject(error);
      }
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 200_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function collapseWs(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVoteSystemPrompt(vote = {}) {
  const politician = collapseWs(vote.politicianName || "this legislator");
  const billTitle = collapseWs(
    vote.billTitle || vote.title || vote.billNumber || "this measure"
  );
  return `You are explaining a specific vote cast by ${politician} on ${billTitle}. Answer user questions about what the vote meant, key provisions, and why a legislator might vote for or against it, maintaining strict neutrality.

### CORE OPERATING RULES:

1. CONTEXT INTEGRATION:
   - Use the politician name, vote cast (YEA / NAY / Present / Not Voting), bill title/number, and official summary / CRS context in the payload.
   - Explain what a Yea or Nay meant for THIS measure in plain English.
   - NEVER invent a personal motive for ${politician}. You may describe common arguments for or against the measure neutrally.
   - NEVER tell the user you lack the bill text when a Summary or Official CRS summary is present.

2. DIRECT LINKS & RESOURCES:
   - When \`bill.congress_url\` is present, include it as a Markdown link when relevant (e.g., [Official Congress.gov Page](url)).

3. TONALITY:
   - Remain helpful, informative, and strictly neutral.
   - Answer directly first, then add nuance.
   - Do not invent provisions or vote tallies that are not in the provided context.`;
}

function normalizeBillType(value) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
  const map = {
    hr: "hr",
    housebill: "hr",
    hjres: "hjres",
    housejointresolution: "hjres",
    hconres: "hconres",
    houseconcurrentresolution: "hconres",
    hres: "hres",
    houseresolution: "hres",
    s: "s",
    senatebill: "s",
    sjres: "sjres",
    senatejointresolution: "sjres",
    sconres: "sconres",
    senateconcurrentresolution: "sconres",
    sres: "sres",
    senateresolution: "sres",
  };
  return map[raw] || raw;
}

function parseBillNumberParts(billNumber) {
  const match = String(billNumber || "")
    .trim()
    .match(
      /^(H\.?\s*R\.?|H\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|H\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?|S\.?\s*Res\.?|S\.?)\s*(\d+)$/i
    );
  if (!match) {
    const loose = String(billNumber || "")
      .trim()
      .match(/^([A-Za-z.]+)\s*(\d+)$/);
    if (!loose) return null;
    return {
      billType: normalizeBillType(loose[1]),
      legislationNumber: loose[2],
    };
  }
  return {
    billType: normalizeBillType(match[1]),
    legislationNumber: match[2],
  };
}

function parseCongressUrl(url) {
  const text = String(url || "");
  const match = text.match(
    /congress\.gov\/bill\/(\d{2,3})(?:th|st|nd|rd)?-congress\/([a-z0-9-]+)\/(\d+)/i
  );
  if (!match) return null;
  return {
    congress: Number(match[1]),
    billType: normalizeBillType(match[2]),
    legislationNumber: match[3],
  };
}

/**
 * Resolve congress + type + number from whatever the client sent.
 */
function parseBillIdentity(bill = {}) {
  const fromFields = {
    congress:
      Number(
        bill.congress || bill.bill_congress || bill.billCongress || 0
      ) || 0,
    billType: normalizeBillType(
      bill.billType ||
        bill.bill_type ||
        bill.type ||
        bill.legislationType ||
        ""
    ),
    legislationNumber: String(
      bill.legislationNumber ||
        bill.legislation_number ||
        bill.billNumberOnly ||
        ""
    ).replace(/\D/g, ""),
  };

  const id = String(bill.id || bill.billId || bill.bill_id || "").toLowerCase();
  const fromId = id.match(
    /(?:federal-|bill-)(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/
  );
  if (fromId) {
    if (!fromFields.congress) fromFields.congress = Number(fromId[1]);
    if (!fromFields.billType) fromFields.billType = normalizeBillType(fromId[2]);
    if (!fromFields.legislationNumber) fromFields.legislationNumber = fromId[3];
  }

  const fromNumber = parseBillNumberParts(
    bill.number || bill.billNumber || bill.bill_number || ""
  );
  if (fromNumber) {
    if (!fromFields.billType) fromFields.billType = fromNumber.billType;
    if (!fromFields.legislationNumber) {
      fromFields.legislationNumber = fromNumber.legislationNumber;
    }
  }

  const fromUrl = parseCongressUrl(
    bill.congress_url ||
      bill.congressUrl ||
      bill.official_url ||
      bill.officialUrl ||
      bill.href ||
      ""
  );
  if (fromUrl) {
    if (!fromFields.congress) fromFields.congress = fromUrl.congress;
    if (!fromFields.billType) fromFields.billType = fromUrl.billType;
    if (!fromFields.legislationNumber) {
      fromFields.legislationNumber = fromUrl.legislationNumber;
    }
  }

  if (!fromFields.congress) fromFields.congress = DEFAULT_CONGRESS;
  if (!fromFields.billType || !fromFields.legislationNumber) return null;
  return fromFields;
}

function looksLikeStatusOnly(text) {
  const t = collapseWs(text);
  if (!t) return true;
  if (t.length > 420) return false;
  return /^(received in the (senate|house)|referred to the (committee|subcommittee)|passed\/agreed to|became public law|read (the )?(first|second) time|placed on (the )?(senate|house|legislative|union) calendar|introduced in the (house|senate)|message on (senate|house) action|consideration and (passage|markup)|motion to (proceed|reconsider)|agreed to by)/i.test(
    t
  );
}

function policyTextLength(bill = {}) {
  const keyPoints = Array.isArray(bill.keyPoints)
    ? bill.keyPoints
    : Array.isArray(bill.key_points)
      ? bill.key_points
      : [];
  return [
    bill.takeaway,
    bill.cardSummary,
    bill.card_summary,
    bill.plain_summary,
    bill.summary,
    bill.crsSummary,
    bill.officialSummary,
    ...keyPoints,
    bill.proArgument,
    bill.conArgument,
  ]
    .map((part) => collapseWs(part))
    .filter(Boolean)
    .join(" ").length;
}

function needsEnrichment(bill = {}) {
  const substantive = collapseWs(
    bill.cardSummary ||
      bill.card_summary ||
      bill.plain_summary ||
      bill.takeaway ||
      bill.crsSummary ||
      ""
  );
  if (substantive && !looksLikeStatusOnly(substantive) && substantive.length >= 80) {
    return false;
  }
  const summary = collapseWs(bill.summary || bill.shortPitch || "");
  if (summary && !looksLikeStatusOnly(summary) && summary.length >= 120) {
    return false;
  }
  return true;
}

function voteDateMs(row = {}) {
  const raw = row.vote_date || row.updated_at || "";
  if (!raw) return 0;
  const date = new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function preferProcessedRow(candidate, existing) {
  if (!existing) return true;
  const score = (row) => {
    const plain = collapseWs(
      row.card_summary || row.plain_summary || row.what_it_does || row.summary || ""
    );
    const kind =
      String(row.vote_kind || "").toLowerCase() === "final_passage" ? 2 : 0;
    const billRow = /^bill-/i.test(String(row.roll_call_id || "")) ? 1 : 0;
    return kind * 1e9 + billRow * 1e8 + plain.length * 10 + voteDateMs(row);
  };
  return score(candidate) > score(existing);
}

async function lookupProcessedVote(identity) {
  if (!identity) return null;
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.warn("Ask AI: Supabase unavailable for enrich:", error.message || error);
    return null;
  }

  const select =
    "roll_call_id, title, summary, short_title, plain_summary, card_summary, what_it_does, takeaway, key_points, pro_argument, con_argument, yea_means, nay_means, bill_number, legislation_number, bill_type, congress, official_url, clerk_url, vote_kind, vote_date, result, chamber, roll_call_number, updated_at";

  try {
    // bill_type may be stored as HR or hr depending on sync path.
    const typeUpper = String(identity.billType).toUpperCase();
    const typeLower = String(identity.billType).toLowerCase();
    const { data, error } = await supabase
      .from("processed_votes")
      .select(select)
      .eq("congress", Number(identity.congress))
      .eq("legislation_number", String(identity.legislationNumber))
      .in("bill_type", [typeUpper, typeLower])
      .order("vote_date", { ascending: false })
      .limit(12);
    if (error) throw error;
    let best = null;
    for (const row of data || []) {
      if (preferProcessedRow(row, best)) best = row;
    }
    if (best) return best;

    // Fallback: match on legislation_number + normalized type from bill_number.
    const { data: loose, error: looseError } = await supabase
      .from("processed_votes")
      .select(select)
      .eq("congress", Number(identity.congress))
      .eq("legislation_number", String(identity.legislationNumber))
      .order("vote_date", { ascending: false })
      .limit(20);
    if (looseError) throw looseError;
    for (const row of loose || []) {
      const rowType = normalizeBillType(row.bill_type || row.bill_number);
      if (rowType !== identity.billType) continue;
      if (preferProcessedRow(row, best)) best = row;
    }
    return best;
  } catch (error) {
    console.warn("Ask AI: processed_votes lookup failed:", error.message || error);
    return null;
  }
}

function mergeProcessedIntoBill(bill, row) {
  if (!row) return bill;
  const next = { ...bill };
  const plain = collapseWs(
    row.card_summary || row.plain_summary || row.what_it_does || ""
  );
  const summary = plain || collapseWs(row.summary || "");
  if (summary && (needsEnrichment(next) || policyTextLength(next) < summary.length)) {
    next.cardSummary = plain || summary;
    next.card_summary = next.cardSummary;
    next.plain_summary = plain || summary;
    next.summary = summary;
  }
  if (row.takeaway && !collapseWs(next.takeaway)) {
    next.takeaway = collapseWs(row.takeaway);
  } else if (row.short_title && !collapseWs(next.takeaway)) {
    next.takeaway = collapseWs(row.short_title);
  }
  const keyPoints = Array.isArray(row.key_points) ? row.key_points : [];
  if (keyPoints.length && !(next.keyPoints || []).length) {
    next.keyPoints = keyPoints;
    next.key_points = keyPoints;
  }
  if (row.pro_argument && !collapseWs(next.proArgument || next.pro_argument)) {
    next.proArgument = collapseWs(row.pro_argument);
  } else if (row.yea_means && !collapseWs(next.proArgument)) {
    next.proArgument = collapseWs(row.yea_means);
  }
  if (row.con_argument && !collapseWs(next.conArgument || next.con_argument)) {
    next.conArgument = collapseWs(row.con_argument);
  } else if (row.nay_means && !collapseWs(next.conArgument)) {
    next.conArgument = collapseWs(row.nay_means);
  }
  if (row.title && (!collapseWs(next.title) || /untitled/i.test(next.title))) {
    next.title = collapseWs(row.title);
  }
  if (row.bill_number && !collapseWs(next.number || next.billNumber)) {
    next.number = collapseWs(row.bill_number);
  }
  const url = collapseWs(row.official_url || row.clerk_url || "");
  if (url && !collapseWs(next.congress_url || next.officialUrl || next.href)) {
    next.congress_url = url;
    next.officialUrl = url;
  }
  if (!next.rollMeta) next.rollMeta = {};
  if (row.result) next.rollMeta.result = next.rollMeta.result || row.result;
  if (row.chamber) next.rollMeta.chamber = next.rollMeta.chamber || row.chamber;
  if (row.roll_call_number != null) {
    next.rollMeta.rollCallNumber =
      next.rollMeta.rollCallNumber ?? row.roll_call_number;
  }
  if (row.vote_date) {
    next.rollMeta.date =
      next.rollMeta.date || String(row.vote_date).slice(0, 10);
  }
  next.congress = next.congress || row.congress;
  next.billType = next.billType || normalizeBillType(row.bill_type);
  next.legislationNumber =
    next.legislationNumber || String(row.legislation_number || "");
  return next;
}

async function enrichFromCongressApi(bill, identity) {
  const apiKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!apiKey || !identity) return bill;
  try {
    const parent = await fetchParentBillContext(
      {
        congress: identity.congress,
        bill_type: identity.billType,
        legislation_number: identity.legislationNumber,
        bill_number: bill.number || bill.billNumber || "",
      },
      apiKey
    );
    if (!parent) return bill;
    const next = { ...bill };
    const crs = collapseWs(parent.summaryText || "").slice(0, CRS_CONTEXT_MAX_CHARS);
    if (crs) {
      next.crsSummary = crs;
      if (needsEnrichment(next) || looksLikeStatusOnly(next.summary)) {
        // Keep status separately if the client only sent status as summary.
        if (looksLikeStatusOnly(next.summary) && !next.statusLabel) {
          next.statusLabel = collapseWs(next.summary);
        }
        next.summary = crs;
        if (!collapseWs(next.cardSummary || next.card_summary)) {
          next.cardSummary = crs.slice(0, 500);
        }
      }
    }
    if (parent.title && (!collapseWs(next.title) || /untitled/i.test(next.title))) {
      next.title = parent.title;
    }
    if (parent.shortTitle && !collapseWs(next.takeaway)) {
      next.takeaway = parent.shortTitle;
    }
    if (parent.billNumber && !collapseWs(next.number)) {
      next.number = parent.billNumber;
    }
    if (!collapseWs(next.congress_url || next.officialUrl)) {
      const url = `https://www.congress.gov/bill/${identity.congress}th-congress/${identity.billType}/${identity.legislationNumber}`;
      next.congress_url = url;
      next.officialUrl = url;
    }
    next.congress = identity.congress;
    next.billType = identity.billType;
    next.legislationNumber = identity.legislationNumber;
    return next;
  } catch (error) {
    console.warn("Ask AI: Congress.gov enrich failed:", error.message || error);
    return bill;
  }
}

async function enrichBillContext(bill = {}) {
  let next = { ...bill };
  const identity = parseBillIdentity(next);
  if (identity) {
    next.congress = identity.congress;
    next.billType = identity.billType;
    next.legislationNumber = identity.legislationNumber;
    if (!collapseWs(next.congress_url || next.officialUrl || next.href)) {
      const url = `https://www.congress.gov/bill/${identity.congress}th-congress/${identity.billType}/${identity.legislationNumber}`;
      next.congress_url = url;
      next.officialUrl = url;
    }
  }

  // Always try DB when identity is known — fills key points / takeaway even if
  // the client already sent a short pitch.
  if (identity) {
    const row = await lookupProcessedVote(identity);
    if (row) next = mergeProcessedIntoBill(next, row);
  }

  if (needsEnrichment(next) && identity) {
    next = await enrichFromCongressApi(next, identity);
  }

  return next;
}

async function enrichVoteContext(raw = {}) {
  const billish = {
    id: raw.billId || raw.id || "",
    title: raw.billTitle || raw.title || "",
    number: raw.billNumber || raw.number || "",
    summary: raw.billSummary || raw.summary || raw.cardSummary || "",
    cardSummary: raw.cardSummary || raw.billSummary || "",
    takeaway: raw.takeaway || "",
    congress: raw.congress || null,
    billType: raw.billType || raw.bill_type || "",
    legislationNumber: raw.legislationNumber || raw.legislation_number || "",
    congress_url:
      raw.congress_url ||
      raw.congressUrl ||
      raw.officialUrl ||
      raw.official_url ||
      raw.href ||
      "",
    officialUrl:
      raw.officialUrl ||
      raw.official_url ||
      raw.congress_url ||
      raw.href ||
      "",
    keyPoints: raw.keyPoints || raw.key_points || [],
    proArgument: raw.proArgument || raw.pro_argument || "",
    conArgument: raw.conArgument || raw.con_argument || "",
  };
  const enriched = await enrichBillContext(billish);
  return {
    type: "vote",
    politicianName: collapseWs(
      raw.politicianName || raw.politician_name || "This legislator"
    ),
    voteCast: collapseWs(
      raw.voteCast || raw.vote_cast || raw.votePosition || raw.stance || ""
    ).toUpperCase(),
    billTitle: collapseWs(
      enriched.title || raw.billTitle || raw.title || "Untitled measure"
    ),
    billNumber: collapseWs(
      enriched.number || raw.billNumber || raw.number || ""
    ),
    billSummary: collapseWs(
      enriched.cardSummary ||
        enriched.summary ||
        enriched.crsSummary ||
        raw.billSummary ||
        raw.summary ||
        ""
    ),
    takeaway: collapseWs(enriched.takeaway || raw.takeaway || ""),
    crsSummary: collapseWs(enriched.crsSummary || ""),
    keyPoints: enriched.keyPoints || enriched.key_points || [],
    proArgument: collapseWs(
      enriched.proArgument || enriched.pro_argument || ""
    ),
    conArgument: collapseWs(
      enriched.conArgument || enriched.con_argument || ""
    ),
    congress_url: collapseWs(
      enriched.congress_url ||
        enriched.officialUrl ||
        raw.congress_url ||
        raw.officialUrl ||
        ""
    ),
    congress: enriched.congress || raw.congress || null,
    billType: enriched.billType || "",
    legislationNumber: enriched.legislationNumber || "",
  };
}

function buildBillContextBlock(bill = {}) {
  const keyPoints = Array.isArray(bill.keyPoints)
    ? bill.keyPoints
    : Array.isArray(bill.key_points)
      ? bill.key_points
      : [];
  const roll = bill.rollMeta || bill.roll_meta || {};
  const congressUrl = collapseWs(
    bill.congress_url ||
      bill.congressUrl ||
      bill.official_url ||
      bill.officialUrl ||
      bill.href ||
      ""
  );
  const status = collapseWs(bill.statusLabel || bill.status_label || "");
  const summary = collapseWs(
    bill.cardSummary || bill.card_summary || bill.summary || bill.plain_summary || ""
  );
  const crs = collapseWs(bill.crsSummary || bill.officialSummary || "");
  const lines = [
    `Title: ${collapseWs(bill.title || bill.rawTitle || "Untitled measure")}`,
    `Bill / roll call: ${collapseWs(bill.number || bill.billNumber || "")}`,
    bill.congress
      ? `Congress: ${bill.congress}${
          bill.billType && bill.legislationNumber
            ? ` · ${String(bill.billType).toUpperCase()} ${bill.legislationNumber}`
            : ""
        }`
      : "",
    congressUrl ? `bill.congress_url: ${congressUrl}` : "",
    status && status !== summary ? `Legislative status: ${status}` : "",
    `Takeaway: ${collapseWs(bill.takeaway || "")}`,
    summary ? `Summary: ${summary}` : "",
    crs && crs !== summary
      ? `Official CRS summary: ${crs.slice(0, CRS_CONTEXT_MAX_CHARS)}`
      : "",
    keyPoints.length
      ? `Key points:\n- ${keyPoints
          .map((p) => collapseWs(p))
          .filter(Boolean)
          .slice(0, 8)
          .join("\n- ")}`
      : "",
    `Supporters argue: ${collapseWs(
      bill.proArgument || bill.yea || bill.pro_argument || ""
    )}`,
    `Opponents argue: ${collapseWs(
      bill.conArgument || bill.nay || bill.con_argument || ""
    )}`,
    `Roll call: ${[
      roll.result,
      roll.chamber,
      roll.rollCallNumber != null ? `Roll Call ${roll.rollCallNumber}` : "",
      roll.date,
      roll.yeaCount != null && roll.nayCount != null
        ? `Yea ${roll.yeaCount} · Nay ${roll.nayCount}`
        : "",
      bill.resultLabel || "",
    ]
      .map((part) => collapseWs(part))
      .filter(Boolean)
      .join(" · ")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildVoteContextBlock(vote = {}) {
  const keyPoints = Array.isArray(vote.keyPoints) ? vote.keyPoints : [];
  const congressUrl = collapseWs(vote.congress_url || vote.officialUrl || "");
  const summary = collapseWs(vote.billSummary || vote.summary || "");
  const crs = collapseWs(vote.crsSummary || "");
  const lines = [
    `Politician: ${collapseWs(vote.politicianName || "Unknown")}`,
    `Vote cast: ${collapseWs(vote.voteCast || "Unknown")}`,
    `Bill title: ${collapseWs(vote.billTitle || "Untitled measure")}`,
    `Bill number: ${collapseWs(vote.billNumber || "")}`,
    vote.congress
      ? `Congress: ${vote.congress}${
          vote.billType && vote.legislationNumber
            ? ` · ${String(vote.billType).toUpperCase()} ${vote.legislationNumber}`
            : ""
        }`
      : "",
    congressUrl ? `bill.congress_url: ${congressUrl}` : "",
    vote.takeaway ? `Takeaway: ${collapseWs(vote.takeaway)}` : "",
    summary ? `Official summary / context: ${summary}` : "",
    crs && crs !== summary
      ? `Official CRS summary: ${crs.slice(0, CRS_CONTEXT_MAX_CHARS)}`
      : "",
    keyPoints.length
      ? `Key points:\n- ${keyPoints
          .map((p) => collapseWs(p))
          .filter(Boolean)
          .slice(0, 8)
          .join("\n- ")}`
      : "",
    vote.proArgument
      ? `Supporters argue: ${collapseWs(vote.proArgument)}`
      : "",
    vote.conArgument
      ? `Opponents argue: ${collapseWs(vote.conArgument)}`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function buildUserMessage(question, contextBlock, type = "bill") {
  const label =
    type === "vote"
      ? "Vote / bill details payload"
      : "Bill details / metadata payload";
  return `${label}:
"""
${contextBlock}
"""

User question: ${question}

Follow the system rules. Answer directly first from the Summary / Official CRS summary / Key points when present. When an official URL is present as bill.congress_url, include it as a Markdown link when relevant. Do not ask the user to paste the bill text.`;
}

function beginSse(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function streamTextAnswer(res, text, meta = {}) {
  beginSse(res);
  sendSse(res, "start", { provider: meta.provider || "fallback" });
  const answer = collapseWs(text);
  // Chunk so the UI streaming cursor still feels alive.
  const size = 48;
  for (let i = 0; i < answer.length; i += size) {
    sendSse(res, "token", { text: answer.slice(i, i + size) });
  }
  sendSse(res, "done", {});
  res.end();
}

function collectBillFacts(bill = {}) {
  const keyPoints = Array.isArray(bill.keyPoints)
    ? bill.keyPoints
    : Array.isArray(bill.key_points)
      ? bill.key_points
      : [];
  const bits = [
    bill.takeaway,
    bill.cardSummary || bill.summary || bill.plain_summary || bill.crsSummary,
    ...keyPoints,
    bill.proArgument || bill.yea || bill.pro_argument,
    bill.conArgument || bill.nay || bill.con_argument,
  ]
    .map((part) => collapseWs(part))
    .filter(Boolean)
    .filter((part) => !looksLikeStatusOnly(part));
  return bits;
}

/**
 * Grounded non-LLM answer from the bill card when no API key is configured
 * on the serverless host (common if Anthropic is only in local .env).
 */
function answerFromBillContext(question, bill = {}) {
  const q = collapseWs(question).toLowerCase();
  const facts = collectBillFacts(bill);
  const hay = facts.join(" ").toLowerCase();
  const title = collapseWs(bill.title || bill.number || "This measure");
  const congressUrl = collapseWs(
    bill.congress_url || bill.officialUrl || bill.href || ""
  );

  const moneyHits = facts.filter((f) =>
    /\$|billion|million|appropriat|fund|budget|spending|tax|fee|revenue/i.test(f)
  );
  const peopleHits = facts.filter((f) =>
    /household|worker|family|student|immigrant|community|business|veteran|patient|voter|employer|resident|citizen|who|affect/i.test(
      f
    )
  );
  const timeHits = facts.filter((f) =>
    /deadline|timeline|fiscal year|fy\s*\d|by \d{4}|effective|implement|phase|year|month|date/i.test(
      f
    )
  );

  const withLink = (text) =>
    congressUrl
      ? `${text} Official page: ${congressUrl}`
      : text;

  if (/fund|cost|pay for|budget|appropriat|dollar|spend/i.test(q)) {
    if (moneyHits.length) {
      return withLink(
        `${moneyHits.slice(0, 2).join(" ")} The available summary does not spell out a fuller financing plan beyond that.`
      );
    }
    return withLink(
      `The available summary for ${title} does not clearly say how the measure is funded.`
    );
  }

  if (/impact|affect|who|harm|benefit|community/i.test(q)) {
    if (peopleHits.length) {
      return withLink(`${peopleHits.slice(0, 2).join(" ")}`);
    }
    if (facts[0]) {
      return withLink(
        `${facts[0]} The summary does not name a more specific group beyond that.`
      );
    }
    return withLink(
      `The available summary for ${title} does not clearly identify who is most impacted.`
    );
  }

  if (/timeline|when|deadline|implement|effective|schedule/i.test(q)) {
    if (timeHits.length) {
      return withLink(`${timeHits.slice(0, 2).join(" ")}`);
    }
    const roll = bill.rollMeta || {};
    if (roll.date) {
      return withLink(
        `This roll call is dated ${collapseWs(roll.date)}. The summary does not include a detailed implementation timeline.`
      );
    }
    if (bill.statusLabel) {
      return withLink(
        `Latest legislative status: ${collapseWs(bill.statusLabel)}. A detailed implementation timeline is not in the summary.`
      );
    }
    return withLink(
      `The available summary for ${title} does not include a clear implementation timeline.`
    );
  }

  if (facts.length) {
    return withLink(
      `${facts.slice(0, 2).join(" ")}${
        /unknown|not (clearly )?say|does not/i.test(hay)
          ? ""
          : ""
      }`
    );
  }

  return withLink(
    `There is not enough plain-English policy detail loaded yet to answer that about ${title}.`
  );
}

async function streamAnthropic({ question, contextBlock, res, systemPrompt, type }) {
  const apiKey = env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
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
      max_tokens: 900,
      temperature: 0.2,
      stream: true,
      system: systemPrompt || BILL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserMessage(question, contextBlock, type || "bill"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 240)}`);
  }

  beginSse(res);
  sendSse(res, "start", { provider: "anthropic" });

  const reader = response.body?.getReader?.();
  if (!reader) {
    // Rare non-stream body fallback
    const text = await response.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        const delta = parsed?.delta?.text || "";
        if (delta) sendSse(res, "token", { text: delta });
      } catch {
        /* ignore */
      }
    }
    sendSse(res, "done", {});
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() || "";
    for (const line of chunks) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (
        parsed?.type === "content_block_delta" &&
        parsed?.delta?.type === "text_delta" &&
        parsed?.delta?.text
      ) {
        sendSse(res, "token", { text: parsed.delta.text });
      }
      if (parsed?.type === "message_stop") {
        sendSse(res, "done", {});
      }
    }
  }
  sendSse(res, "done", {});
  res.end();
}

async function streamOpenAI({ question, contextBlock, res, systemPrompt, type }) {
  const apiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
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
      temperature: 0.2,
      max_tokens: 900,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt || BILL_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserMessage(question, contextBlock, type || "bill"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 240)}`);
  }

  beginSse(res);
  sendSse(res, "start", { provider: "openai" });

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error("OpenAI stream body unavailable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() || "";
    for (const line of chunks) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const delta = parsed?.choices?.[0]?.delta?.content || "";
      if (delta) sendSse(res, "token", { text: delta });
    }
  }
  sendSse(res, "done", {});
  res.end();
}

function answerFromVoteContext(question, vote = {}) {
  const politician = collapseWs(vote.politicianName || "This legislator");
  const cast = collapseWs(vote.voteCast || "their vote").toUpperCase();
  const title = collapseWs(vote.billTitle || vote.billNumber || "this measure");
  const summary = collapseWs(vote.billSummary || vote.crsSummary || vote.takeaway || "");
  const congressUrl = collapseWs(vote.congress_url || "");
  const withLink = (text) =>
    congressUrl ? `${text} Official page: ${congressUrl}` : text;

  if (/why|reason|support|oppose|yea|nay/i.test(question) && summary) {
    return withLink(
      `${politician} voted ${cast} on ${title}. ${summary} Common arguments for and against this kind of measure usually track the provisions above; the available context does not state ${politician}'s personal rationale.`
    );
  }
  if (summary) {
    return withLink(
      `${politician} voted ${cast} on ${title}. ${summary}`
    );
  }
  return withLink(
    `${politician} voted ${cast} on ${title}. There is not enough plain-English summary loaded yet to explain the measure further.`
  );
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await readBody(req);
    const question = collapseWs(body.question || body.q || "");
    if (!question) {
      return json(res, 400, { error: "Provide a question." });
    }
    if (question.length > 400) {
      return json(res, 400, { error: "Question is too long (max 400 chars)." });
    }

    const typeRaw = String(
      body.type || body.context?.type || body.vote?.type || "bill"
    ).toLowerCase();
    const type = typeRaw === "vote" ? "vote" : "bill";

    let contextBlock = "";
    let systemPrompt = BILL_SYSTEM_PROMPT;
    let fallbackAnswer = "";

    if (type === "vote") {
      const rawVote = body.vote || body.context || body.payload || {};
      const vote = await enrichVoteContext(rawVote);
      contextBlock = buildVoteContextBlock(vote);
      systemPrompt = buildVoteSystemPrompt(vote);
      fallbackAnswer = answerFromVoteContext(question, vote);
      const hasSubstance = Boolean(
        collapseWs(
          vote.billSummary ||
            vote.crsSummary ||
            vote.billTitle ||
            vote.billNumber ||
            vote.voteCast ||
            ""
        )
      );
      if (!hasSubstance) {
        return json(res, 400, { error: "Provide vote context." });
      }
    } else {
      const rawBill = body.bill || body.context || body.payload || {};
      const bill = await enrichBillContext(rawBill);
      contextBlock = buildBillContextBlock(bill);
      systemPrompt = BILL_SYSTEM_PROMPT;
      fallbackAnswer = answerFromBillContext(question, bill);
      const hasSubstance = Boolean(
        collapseWs(
          bill.cardSummary ||
            bill.summary ||
            bill.plain_summary ||
            bill.crsSummary ||
            bill.takeaway ||
            bill.title ||
            bill.number ||
            ""
        )
      );
      if (!hasSubstance) {
        return json(res, 400, { error: "Provide bill context." });
      }
    }

    if (env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY")) {
      await streamAnthropic({
        question,
        contextBlock,
        res,
        systemPrompt,
        type,
      });
      return;
    }
    if (env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY")) {
      await streamOpenAI({
        question,
        contextBlock,
        res,
        systemPrompt,
        type,
      });
      return;
    }

    console.warn(
      "Ask AI: no ANTHROPIC_API_KEY/OPENAI_API_KEY on this host — using context fallback. Add the key in Vercel → Project Settings → Environment Variables (Production)."
    );
    streamTextAnswer(res, fallbackAnswer, {
      provider: type === "vote" ? "vote-card-fallback" : "bill-card-fallback",
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      return json(res, 500, {
        error: error.message || "Could not answer that question.",
      });
    }
    try {
      sendSse(res, "error", {
        error: error.message || "Could not answer that question.",
      });
      res.end();
    } catch {
      /* ignore */
    }
  }
};
