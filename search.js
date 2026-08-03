const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const resultsEl = document.getElementById("search-results");
const statusEl = document.getElementById("search-status");
const summaryEl = document.getElementById("search-summary");
const emptyEl = document.getElementById("search-empty");
const coverageEl = document.getElementById("search-coverage");
const typeButtons = [
  ...document.querySelectorAll(".search-type-filters__button"),
];

const TYPE_ORDER = ["bill", "law", "regulation"];
const TYPE_LABELS = {
  bill: "Bills",
  law: "Enacted Laws",
  regulation: "Agency Regulations",
};

let activeTypes = new Set(TYPE_ORDER);
let searchTimeout = null;
let requestId = 0;

function setStatus(message, type = "loading") {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.dataset.type = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.dataset.type = type;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function selectedTypesParam() {
  return TYPE_ORDER.filter((type) => activeTypes.has(type)).join(",");
}

function syncTypeButtons() {
  typeButtons.forEach((button) => {
    const type = button.dataset.type;
    const on = activeTypes.has(type);
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function renderCoverage(coverage) {
  if (!coverage) {
    coverageEl.hidden = true;
    coverageEl.textContent = "";
    return;
  }
  coverageEl.hidden = false;
  coverageEl.textContent = `Coverage — Bills: ${coverage.bills}; Laws: ${coverage.laws}; Regulations: ${coverage.regulations}. Near me & state/local: coming soon.`;
}

function renderCard(item) {
  const article = document.createElement("article");
  article.className = "search-result-card";
  article.dataset.docType = item.docType || "";

  const dateLabel = formatDate(item.lastUpdated);
  const metaBits = [
    item.jurisdiction,
    item.meta?.chamber,
    item.meta?.originatingBill,
    dateLabel,
  ].filter(Boolean);

  const tags = (item.tags || [])
    .slice(0, 4)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");

  const links = [];
  if (item.officialUrl) {
    links.push(
      `<a class="bill-card__link" href="${escapeHtml(
        item.officialUrl
      )}" target="_blank" rel="noopener noreferrer">Official source</a>`
    );
  }
  if (item.pdfUrl) {
    links.push(
      `<a class="bill-card__link" href="${escapeHtml(
        item.pdfUrl
      )}" target="_blank" rel="noopener noreferrer">PDF</a>`
    );
  }

  article.innerHTML = `
    <div class="search-result-card__badges">
      <span class="search-result-card__type search-result-card__type--${escapeHtml(
        item.docType || "bill"
      )}">${escapeHtml(item.docTypeLabel || "Document")}</span>
      ${
        item.billNumber
          ? `<span class="search-result-card__id">${escapeHtml(
              item.billNumber
            )}</span>`
          : ""
      }
      <span class="search-result-card__level">${escapeHtml(
        item.level || "Federal"
      )}</span>
    </div>
    <h2 class="search-result-card__title">${escapeHtml(item.title)}</h2>
    <p class="search-result-card__meta">${escapeHtml(metaBits.join(" · "))}</p>
    ${
      typeof renderCollapsibleSummaryHtml === "function"
        ? renderCollapsibleSummaryHtml(item, {
            escapeHtmlFn: escapeHtml,
            paragraphClass: "search-result-card__pitch",
          })
        : `<p class="search-result-card__pitch">${escapeHtml(
            item.plain_summary ||
              item.plainSummary ||
              item.shortPitch ||
              ""
          )}</p>`
    }
    ${
      item.statusLabel
        ? `<p class="search-result-card__status">${escapeHtml(
            item.statusLabel
          )}</p>`
        : ""
    }
    ${tags ? `<div class="search-result-card__tags">${tags}</div>` : ""}
    ${
      links.length
        ? `<div class="search-result-card__actions">${links.join("")}</div>`
        : ""
    }
  `;

  if (
    window.PolicyEngagement?.mount &&
    (item.docType === "bill" || item.docType === "law")
  ) {
    const mapped = {
      id: item.id,
      billNumber: item.billNumber,
      title: item.title,
      level: item.level || "Federal",
      jurisdiction: item.jurisdiction || "U.S. Congress",
      shortPitch: item.shortPitch,
      officialUrl: item.officialUrl,
      lastUpdated: item.lastUpdated,
      tags: item.tags || [],
      primarySponsor: { name: item.meta?.chamber || "Congress", title: "" },
      allSteps: [],
      deltaSummary: { added: [], changed: [], removed: [] },
    };
    if (window.PolicyImpact?.mount) {
      window.PolicyImpact.mount(article, mapped);
    }
    window.PolicyEngagement.mount(article, mapped);
  }

  return article;
}

function renderResults(payload) {
  const items = payload.items || [];
  resultsEl.replaceChildren(...items.map(renderCard));
  emptyEl.hidden = items.length > 0;

  if (!payload.query) {
    summaryEl.hidden = false;
    summaryEl.textContent =
      items.length > 0
        ? `Browsing recent federal activity (${items.length}). Enter a keyword or citation to search.`
        : "Enter a keyword or citation to search federal bills, laws, and regulations.";
  } else {
    const groups = payload.groups || {};
    const parts = TYPE_ORDER.filter((type) => activeTypes.has(type)).map(
      (type) => {
        const key = type === "bill" ? "bills" : type === "law" ? "laws" : "regulations";
        return `${groups[key] ?? 0} ${TYPE_LABELS[type].toLowerCase()}`;
      }
    );
    summaryEl.hidden = false;
    summaryEl.textContent =
      items.length > 0
        ? `Found ${items.length} result${items.length === 1 ? "" : "s"} for “${
            payload.query
          }” (${parts.join(", ")}).`
        : `No results for “${payload.query}”.`;
  }

  renderCoverage(payload.coverage);

  const errorParts = Object.entries(payload.errors || {})
    .filter(([, message]) => message)
    .map(([key, message]) => `${key}: ${message}`);
  if (errorParts.length && items.length === 0) {
    setStatus(`Search partially failed (${errorParts.join("; ")})`, "error");
  } else if (errorParts.length) {
    setStatus(`Some sources had issues (${errorParts.join("; ")})`, "loading");
  } else {
    setStatus("", "success");
  }
}

async function runSearch({ debounce = false } = {}) {
  const query = searchInput.value.trim();
  const types = selectedTypesParam();

  if (!types) {
    resultsEl.replaceChildren();
    emptyEl.hidden = false;
    emptyEl.textContent = "Select at least one document type to search.";
    summaryEl.hidden = true;
    setStatus("", "success");
    return;
  }

  emptyEl.textContent =
    "No matching federal documents. Try another keyword, a bill number, or a public law citation.";

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("types", types);
  params.set("limit", "12");
  // Server prefers CONGRESS_API_KEY env; this matches config.js used by other pages.
  if (typeof API_KEY === "string" && API_KEY.trim()) {
    params.set("api_key", API_KEY.trim());
  }

  const thisRequest = ++requestId;
  setStatus(
    query ? `Searching for “${query}”…` : "Loading recent federal documents…",
    "loading"
  );
  emptyEl.hidden = true;
  summaryEl.hidden = true;
  if (typeof showSkeletonCards === "function") {
    showSkeletonCards(resultsEl, { type: "search", count: 5 });
  }

  try {
    const response = await fetch(`/api/legislation-search?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (thisRequest !== requestId) return;

    if (!response.ok) {
      throw new Error(payload.error || `Search failed (${response.status})`);
    }

    renderResults(payload);

    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    url.searchParams.set("types", types);
    window.history.replaceState({}, "", url);
  } catch (error) {
    if (thisRequest !== requestId) return;
    console.error(error);
    resultsEl.replaceChildren();
    emptyEl.hidden = true;
    summaryEl.hidden = true;
    setStatus(
      error.message ||
        "Search failed. Check your connection and Congress.gov API key, then try again.",
      "error"
    );
  }
}

function scheduleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => runSearch(), 450);
}

typeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const type = button.dataset.type;
    if (activeTypes.has(type)) {
      if (activeTypes.size === 1) return;
      activeTypes.delete(type);
    } else {
      activeTypes.add(type);
    }
    syncTypeButtons();
    runSearch();
  });
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchTimeout);
  runSearch();
});

searchInput.addEventListener("input", scheduleSearch);
searchInput.addEventListener("search", () => {
  clearTimeout(searchTimeout);
  runSearch();
});

function bootFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";
  const typesRaw = params.get("types");
  if (typesRaw) {
    const next = new Set(
      typesRaw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => TYPE_ORDER.includes(part))
    );
    if (next.size) activeTypes = next;
  }
  searchInput.value = q;
  syncTypeButtons();
  runSearch();
}

(async function bootSearchPage() {
  if (window.PolicyEngagement?.init) {
    try {
      await window.PolicyEngagement.init();
      const header = document.querySelector(".page--search .header > div");
      window.PolicyEngagement.renderHeaderScore(header);
    } catch (error) {
      console.warn(error);
    }
  }
  if (window.PolicyImpact?.loadBaselines) {
    try {
      await window.PolicyImpact.loadBaselines();
    } catch (error) {
      console.warn(error);
    }
  }
  bootFromUrl();
})();
