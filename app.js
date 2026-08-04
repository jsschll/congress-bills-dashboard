const CONGRESS = 119;
const BILL_LIMIT = 12;
const API_BASE = "https://api.congress.gov/v3";

// Set to true and add an API key to generate bullets via an LLM instead of heuristics.
const LLM_ENABLED = false;
const LLM_API_KEY = "";

const grid = document.getElementById("bills-grid");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh-btn");
const searchInput = document.getElementById("search-input");
const noResultsEl = document.getElementById("no-results");
const LAST_REFRESH_KEY = "congress-bills-last-refresh";
const summaryCache = new Map();
let searchTimeout;
let previousRefreshAt = readLastRefreshAt();

function readLastRefreshAt() {
  const raw = sessionStorage.getItem(LAST_REFRESH_KEY);
  if (!raw) return null;
  const timestamp = Number(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function markRefreshComplete() {
  const now = Date.now();
  sessionStorage.setItem(LAST_REFRESH_KEY, String(now));
  previousRefreshAt = now;
}

function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function getBillActivityTimestamp(bill) {
  return Math.max(
    toTimestamp(bill.updateDate) || 0,
    toTimestamp(bill.updateDateIncludingText) || 0,
    toTimestamp(bill.latestActionDate) || 0
  );
}

function getBillFlags(bill) {
  if (!previousRefreshAt) {
    return { isNew: false, hasUpdates: false };
  }

  const introducedAt = toTimestamp(bill.introducedDate);
  const activityAt = getBillActivityTimestamp(bill);
  const isNew = Boolean(introducedAt && introducedAt > previousRefreshAt);
  const hasUpdates = Boolean(
    activityAt &&
      activityAt > previousRefreshAt &&
      (!introducedAt || activityAt > introducedAt || !isNew)
  );

  return { isNew, hasUpdates };
}

function getHighlightTerms(query, reference) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const terms = [trimmed];

  if (reference) {
    terms.push(
      `${reference.type.toUpperCase()} ${reference.number}`,
      reference.type.toUpperCase(),
      reference.number
    );
  } else {
    trimmed.split(/\s+/).forEach((word) => {
      if (!terms.some((term) => term.toLowerCase() === word.toLowerCase())) {
        terms.push(word);
      }
    });
  }

  return [...new Set(terms.filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
}

function highlightText(text, terms) {
  const value = text || "";

  if (!value || terms.length === 0) {
    return document.createTextNode(value);
  }

  const lowerText = value.toLowerCase();
  const ranges = [];

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    let start = 0;

    while (start <= lowerText.length - lowerTerm.length) {
      const index = lowerText.indexOf(lowerTerm, start);
      if (index === -1) break;

      ranges.push({ start: index, end: index + term.length });
      start = index + lowerTerm.length;
    }
  }

  if (ranges.length === 0) {
    return document.createTextNode(value);
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const { start, end } of merged) {
    if (cursor < start) {
      fragment.append(document.createTextNode(value.slice(cursor, start)));
    }

    const mark = document.createElement("mark");
    mark.className = "search-highlight";
    mark.textContent = value.slice(start, end);
    fragment.append(mark);
    cursor = end;
  }

  if (cursor < value.length) {
    fragment.append(document.createTextNode(value.slice(cursor)));
  }

  return fragment;
}

function parseBillReference(query) {
  const normalized = query.trim().replace(/\./g, "").replace(/\s+/g, " ");
  const match = normalized.match(
    /^(?:(\d{3,4})\s+)?(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)\s*(\d+)$/i
  );

  if (!match) return null;

  return {
    congress: match[1] ? Number(match[1]) : CONGRESS,
    type: match[2].toLowerCase(),
    number: match[3],
  };
}

function normalizeBill(bill) {
  const type = String(bill.type || "").toLowerCase();
  const latestAction = bill.latestAction || {};

  return {
    title: bill.title,
    originChamber: bill.originChamber,
    introducedDate: bill.introducedDate,
    updateDate: bill.updateDate,
    updateDateIncludingText: bill.updateDateIncludingText,
    latestActionDate: latestAction.actionDate || bill.latestActionDate,
    latestActionText: latestAction.text || bill.latestActionText,
    type: bill.type,
    number: bill.number,
    congress: bill.congress || CONGRESS,
    url:
      bill.url ||
      `${API_BASE}/bill/${bill.congress || CONGRESS}/${type}/${bill.number}`,
  };
}

function displayBills(bills, highlightQuery = "", { rememberRefresh = true } = {}) {
  const reference = highlightQuery ? parseBillReference(highlightQuery) : null;
  const terms = getHighlightTerms(highlightQuery, reference);

  grid.replaceChildren(
    ...bills.map((bill) => renderBillCard(bill, terms))
  );
  noResultsEl.hidden = bills.length > 0;

  if (rememberRefresh) {
    markRefreshComplete();
  }
}

function billMatchesQuery(summary, terms) {
  const haystack = [
    summary.title,
    summary.originChamber,
    summary.type,
    summary.number,
    `${summary.type || ""} ${summary.number || ""}`,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

async function fetchBillByReference(reference) {
  const url = `${API_BASE}/bill/${reference.congress}/${reference.type}/${reference.number}?format=json&api_key=${API_KEY}`;
  const data = await fetchJson(url);
  if (!data.bill) return [];

  const bill = normalizeBill(data.bill);
  bill.cardSummary = await fetchCardSummary(bill);
  return [bill];
}

async function fetchBillsByKeyword(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [];
  let offset = 0;
  const pageSize = 250;

  while (matches.length < BILL_LIMIT && offset < 1000) {
    const listUrl = `${API_BASE}/bill/${CONGRESS}?limit=${pageSize}&offset=${offset}&sort=updateDate+desc&format=json&api_key=${API_KEY}`;
    const listData = await fetchJson(listUrl);
    const summaries = listData.bills || [];

    if (summaries.length === 0) break;

    for (const summary of summaries) {
      if (billMatchesQuery(summary, terms)) {
        matches.push(summary);
        if (matches.length >= BILL_LIMIT) break;
      }
    }

    offset += summaries.length;
    if (summaries.length < pageSize) break;
  }

  const bills = await Promise.all(matches.map(fetchBillDetails));
  bills.sort(
    (a, b) => new Date(b.introducedDate || 0) - new Date(a.introducedDate || 0)
  );
  return bills;
}

async function searchBills() {
  const query = searchInput.value.trim();

  if (!query) {
    loadBills();
    return;
  }

  refreshBtn.disabled = true;
  searchInput.disabled = true;
  grid.replaceChildren();
  noResultsEl.hidden = true;
  setStatus(`Searching Congress.gov for “${query}”…`, "loading");

  try {
    const reference = parseBillReference(query);
    const bills = reference
      ? await fetchBillByReference(reference)
      : await fetchBillsByKeyword(query);

    displayBills(bills, query, { rememberRefresh: false });
    setStatus("", "success");
  } catch (error) {
    console.error(error);
    setStatus(
      "Search failed. Check your API key and internet connection, then try again.",
      "error"
    );
  } finally {
    refreshBtn.disabled = false;
    searchInput.disabled = false;
  }
}

function scheduleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchBills, 400);
}

function setStatus(message, type = "loading") {
  statusEl.textContent = message;
  statusEl.dataset.type = type;
  statusEl.hidden = type === "success";
}

function formatDate(dateString) {
  if (!dateString) return "Date unavailable";

  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function chamberLabel(chamber) {
  if (chamber === "House") return "House of Representatives";
  if (chamber === "Senate") return "Senate";
  return chamber || "Unknown chamber";
}

function congressGovUrl(bill) {
  const type = String(bill.type || "").toLowerCase();
  const number = bill.number;
  const congress = bill.congress || CONGRESS;
  if (!type || !number) return "https://www.congress.gov/";

  return `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`;
}

function billKey(bill) {
  return `${bill.congress}-${bill.type}-${bill.number}`;
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent.replace(/\s+/g, " ").trim();
}

function truncateToSentences(text) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 15);

  if (sentences.length === 0) return "";
  if (sentences.length === 1) return sentences[0];

  return sentences.slice(0, Math.min(3, sentences.length)).join(" ");
}

function truncateCardSummaryForDisplay(text, maxChars = 250) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length <= maxChars) {
    return { preview: cleaned, truncated: false, full: cleaned };
  }
  let preview = cleaned.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  if (!preview) preview = cleaned.slice(0, maxChars).trim();
  if (!/[.…!?]$/.test(preview)) preview = `${preview}…`;
  return { preview, truncated: true, full: cleaned };
}

function fallbackCardSummary(bill) {
  return `${bill.title} was introduced in the ${chamberLabel(bill.originChamber)} on ${formatDate(bill.introducedDate)}. A detailed CRS summary is not yet available.`;
}

async function fetchBillSummaryHtml(bill) {
  const summariesUrl = `${API_BASE}/bill/${bill.congress}/${String(bill.type).toLowerCase()}/${bill.number}/summaries?format=json&api_key=${API_KEY}`;
  const data = await fetchJson(summariesUrl);
  const summaries = data.summaries || [];

  if (summaries.length === 0) return null;

  const latest = summaries.reduce((current, item) => {
    if (!current) return item;
    const currentDate = new Date(current.updateDate || current.actionDate || 0);
    const itemDate = new Date(item.updateDate || item.actionDate || 0);
    return itemDate > currentDate ? item : current;
  }, null);

  return latest?.text || null;
}

async function fetchCardSummary(bill) {
  const key = billKey(bill);
  if (summaryCache.has(key)) return summaryCache.get(key);

  try {
    const html = await fetchBillSummaryHtml(bill);
    const summary = html
      ? truncateToSentences(stripHtml(html))
      : fallbackCardSummary(bill);

    summaryCache.set(key, summary);
    return summary;
  } catch (error) {
    console.error(error);
    const summary = fallbackCardSummary(bill);
    summaryCache.set(key, summary);
    return summary;
  }
}

function renderStatusLabels(bill) {
  const { isNew, hasUpdates } = getBillFlags(bill);
  if (!isNew && !hasUpdates) return null;

  const labels = document.createElement("div");
  labels.className = "bill-card__labels";

  if (isNew) {
    const newLabel = document.createElement("span");
    newLabel.className = "bill-label bill-label--new";
    newLabel.textContent = "new";
    labels.append(newLabel);
  }

  if (hasUpdates) {
    const updateLabel = document.createElement("span");
    updateLabel.className = "bill-label bill-label--updates";
    updateLabel.textContent = "update(s)";
    labels.append(updateLabel);
  }

  return labels;
}

function renderBillCard(bill, highlightTerms = []) {
  const card = document.createElement("article");
  card.className = "bill-card";
  card.bill = bill;

  const header = document.createElement("div");
  header.className = "bill-card__header";

  const chamber = document.createElement("span");
  chamber.className = "bill-card__chamber";
  chamber.dataset.chamber = bill.originChamber || "";
  chamber.append(highlightText(chamberLabel(bill.originChamber), highlightTerms));

  header.append(chamber);
  const statusLabels = renderStatusLabels(bill);
  if (statusLabels) header.append(statusLabels);

  const title = document.createElement("h2");
  title.className = "bill-card__title";
  title.append(highlightText(bill.title || "Untitled bill", highlightTerms));

  const meta = document.createElement("p");
  meta.className = "bill-card__meta";
  meta.append(
    highlightText(
      `${bill.type} ${bill.number} · Introduced ${formatDate(bill.introducedDate)}`,
      highlightTerms
    )
  );

  const excerpt = document.createElement("div");
  excerpt.className = "bill-card__excerpt summary-collapse";
  const rawSummary = bill.cardSummary || fallbackCardSummary(bill);
  const plain =
    String(bill.plain_summary || bill.plainSummary || "").trim();
  const clipped = plain
    ? { preview: plain, truncated: false, full: plain }
    : typeof truncateSummaryAtWord === "function"
      ? truncateSummaryAtWord(rawSummary, 250)
      : truncateCardSummaryForDisplay(rawSummary, 250);
  const textEl = document.createElement("p");
  textEl.className = "summary-collapse__text";
  textEl.append(highlightText(clipped.preview || rawSummary, highlightTerms));
  excerpt.append(textEl);
  if (clipped.truncated) {
    textEl.dataset.summaryPreview = clipped.preview;
    textEl.dataset.summaryFull = clipped.full;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "summary-collapse__toggle";
    toggle.dataset.summaryToggle = "";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Read More";
    excerpt.append(toggle);
  }

  const link = document.createElement("a");
  link.className = "bill-card__link";
  link.href = congressGovUrl(bill);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View on Congress.gov";

  card.append(header, title, meta, excerpt, link);
  return card;
}

async function fetchJson(url) {
  if (!API_KEY || API_KEY === "YOUR_CONGRESS_GOV_API_KEY") {
    throw new Error("Missing Congress.gov API key");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

function withApiKey(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("api_key", API_KEY);
  parsed.searchParams.set("format", "json");
  return parsed.toString();
}

async function fetchBillDetails(summary) {
  const detailUrl = withApiKey(summary.url);
  const bill = normalizeBill(summary);

  const [detailData, summaryHtml] = await Promise.all([
    fetchJson(detailUrl),
    fetchBillSummaryHtml(bill).catch(() => null),
  ]);

  const fullBill = normalizeBill({
    ...summary,
    ...(detailData.bill || {}),
    latestAction: detailData.bill?.latestAction || summary.latestAction,
    updateDate: detailData.bill?.updateDate || summary.updateDate,
    updateDateIncludingText:
      detailData.bill?.updateDateIncludingText ||
      summary.updateDateIncludingText,
  });
  const cardSummary = summaryHtml
    ? truncateToSentences(stripHtml(summaryHtml))
    : "";

  fullBill.cardSummary = cardSummary || fallbackCardSummary(fullBill);
  summaryCache.set(billKey(fullBill), fullBill.cardSummary);
  return fullBill;
}

async function loadBills() {
  refreshBtn.disabled = true;
  searchInput.disabled = true;
  grid.replaceChildren();
  summaryCache.clear();
  noResultsEl.hidden = true;
  setStatus("Loading recent bills from Congress.gov…", "loading");

  try {
    const listUrl = `${API_BASE}/bill/${CONGRESS}?limit=${BILL_LIMIT}&sort=updateDate+desc&format=json&api_key=${API_KEY}`;
    const listData = await fetchJson(listUrl);
    const summaries = listData.bills || [];

    if (summaries.length === 0) {
      setStatus("No bills found for the current Congress.", "error");
      return;
    }

    const bills = await Promise.all(summaries.map(fetchBillDetails));
    bills.sort(
      (a, b) =>
        new Date(b.introducedDate || 0) - new Date(a.introducedDate || 0)
    );

    displayBills(bills);
    setStatus("", "success");
  } catch (error) {
    console.error(error);
    setStatus(
      "Could not load bills. Check your API key and internet connection, then try again.",
      "error"
    );
  } finally {
    refreshBtn.disabled = false;
    searchInput.disabled = false;
  }
}

refreshBtn.addEventListener("click", () => {
  if (searchInput.value.trim()) {
    searchBills();
  } else {
    loadBills();
  }
});
searchInput.addEventListener("input", scheduleSearch);
searchInput.addEventListener("search", searchBills);
loadBills();
