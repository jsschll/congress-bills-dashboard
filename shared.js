let supabaseClient = null;

function isSupabaseConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("YOUR_SUPABASE") &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  );
}

function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (supabaseClient) return supabaseClient;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase JS library is not loaded.");
    return null;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

async function getSession() {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error(error);
    return null;
  }
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

async function requireUser(redirectTo = "auth.html") {
  const user = await getUser();
  if (!user) {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`
    );
    window.location.href = `${redirectTo}?next=${next}`;
    return null;
  }
  return user;
}

async function signOut() {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut();
  window.location.href = "index.html";
}

async function countFollows(userId) {
  const client = getSupabase();
  if (!client) return 0;
  const { count, error } = await client
    .from("followed_topics")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error(error);
    return 0;
  }
  return count || 0;
}

const VOTER_PULSE_STORAGE_KEY = "voterPulse.completedAt";
const VOTER_PULSE_BANNER_DISMISS_KEY = "voterPulse.bannerDismissedAt";

async function countUserBillStances(userId) {
  const client = getSupabase();
  if (!client || !userId) return 0;
  const { count, error } = await client
    .from("bill_stances")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.warn(error);
    return 0;
  }
  return count || 0;
}

function markVoterPulseComplete(meta = {}) {
  try {
    localStorage.setItem(
      VOTER_PULSE_STORAGE_KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        savedCount: Number(meta.savedCount) || 0,
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function hasMarkedVoterPulseComplete() {
  try {
    return Boolean(localStorage.getItem(VOTER_PULSE_STORAGE_KEY));
  } catch {
    return false;
  }
}

function dismissVoterPulseBanner() {
  try {
    localStorage.setItem(
      VOTER_PULSE_BANNER_DISMISS_KEY,
      new Date().toISOString()
    );
  } catch {
    /* ignore */
  }
}

function isVoterPulseBannerDismissed() {
  try {
    return Boolean(localStorage.getItem(VOTER_PULSE_BANNER_DISMISS_KEY));
  } catch {
    return false;
  }
}

/**
 * Offer Voter Pulse when the user has no saved stances and has not finished
 * (or skipped) the onboarding quiz yet.
 */
async function shouldOfferVoterPulse(user) {
  if (!user?.id) return false;
  if (hasMarkedVoterPulseComplete()) return false;
  const count = await countUserBillStances(user.id);
  return count === 0;
}

async function fetchNotifications({ limit = 20, unreadOnly = false } = {}) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) return [];

  let query = client
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

async function markNotificationRead(notificationId) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) return;

  await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);
}

function congressGovBillUrl(notification) {
  const type = String(notification.bill_type || "").toLowerCase();
  const number = notification.bill_number;
  const congress = notification.bill_congress || 119;
  if (!type || !number) return "https://www.congress.gov/";
  return `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`;
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const VOTE_CARD_DEFAULT_YEA_LABEL = "Support Measure";
const VOTE_CARD_DEFAULT_NAY_LABEL = "Oppose Measure";

/**
 * True for empty/placeholder means copy — do not render the Yea/Nay section.
 */
function isGenericVoteMeans(text = "") {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return true;
  return (
    /described in this measure/.test(value) ||
    /^a yea vote supports advancing this (measure|bill)/.test(value) ||
    /^a nay vote supports rejecting this (measure|bill)/.test(value) ||
    /^a yea vote supports passing this bill/.test(value) ||
    /^a nay vote supports rejecting this bill/.test(value) ||
    /^a yea vote supports this amendment/.test(value) ||
    /^a nay vote supports rejecting this amendment/.test(value) ||
    /^voting yes means you want this to move forward/.test(value) ||
    /^voting no means you want to stop this/.test(value) ||
    /^you support advancing this measure/.test(value) ||
    /^you support rejecting this measure/.test(value) ||
    /^you support ending this program described in this measure/.test(value) ||
    /^you support keeping this program in place/.test(value) ||
    /^you support ending .+ described in this measure/.test(value) ||
    /^support this (roll-call|roll call|measure|bill)/.test(value) ||
    /^oppose this (roll-call|roll call|measure|bill)/.test(value) ||
    /^record a yea/.test(value) ||
    /^record a nay/.test(value)
  );
}

function isShortVoteLabel(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && value.length <= 28;
}

/**
 * Prefer Claude plain_summary over raw CRS / chamber text.
 */
function preferPlainSummaryText(item = {}) {
  return String(
    item.plain_summary ||
      item.plainSummary ||
      item.plainEnglishSummary ||
      item.what_it_does ||
      item.whatItDoes ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve display summary: plain_summary first, else raw CRS fields.
 * @returns {{ text: string, isPlain: boolean }}
 */
function resolveBillOrVoteSummaryText(item = {}) {
  const plain = preferPlainSummaryText(item);
  if (plain) return { text: plain, isPlain: true };
  const raw = String(
    item.officialSummary ||
      item.shortPitch ||
      item.summary ||
      item.cardSummary ||
      item.title ||
      item.voteQuestion ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim();
  return { text: raw, isPlain: false };
}

const DISPLAY_SUMMARY_MAX_CHARS = 250;

function truncateSummaryAtWord(text = "", maxChars = DISPLAY_SUMMARY_MAX_CHARS) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length <= maxChars) {
    return { preview: cleaned, truncated: false, full: cleaned };
  }
  let preview = cleaned.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  if (!preview) preview = cleaned.slice(0, maxChars).trim();
  if (!/[.…!?]$/.test(preview)) preview = `${preview}…`;
  return { preview, truncated: true, full: cleaned };
}

/**
 * Build display copy for bill/vote cards.
 * Plain summaries stay short; raw CRS falls back to ≤250 chars + Read More.
 */
function resolveDisplaySummary(item = {}, options = {}) {
  const maxChars = Number(options.maxChars) || DISPLAY_SUMMARY_MAX_CHARS;
  const maxWords = Number(options.maxWords) || 35;
  const resolved = resolveBillOrVoteSummaryText(item);
  let text = resolved.text;
  if (resolved.isPlain && typeof clampPunchySummary === "function") {
    text =
      clampPunchySummary(text, { maxSentences: 2, maxWords }) || text;
  } else if (resolved.isPlain) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) {
      text = `${words.slice(0, maxWords).join(" ").replace(/[,:;–—-]+$/, "")}.`;
    }
  }
  if (!text) {
    return {
      text: "No plain-English summary is available yet.",
      preview: "No plain-English summary is available yet.",
      full: "No plain-English summary is available yet.",
      truncated: false,
      isPlain: false,
    };
  }
  if (resolved.isPlain) {
    return {
      text,
      preview: text,
      full: text,
      truncated: false,
      isPlain: true,
    };
  }
  const clipped = truncateSummaryAtWord(text, maxChars);
  return {
    text: clipped.preview,
    preview: clipped.preview,
    full: clipped.full,
    truncated: clipped.truncated,
    isPlain: false,
  };
}

/**
 * HTML for a summary block with optional Read More collapse.
 */
function renderCollapsibleSummaryHtml(
  itemOrText,
  {
    escapeHtmlFn,
    className = "",
    maxChars = DISPLAY_SUMMARY_MAX_CHARS,
    paragraphClass = "",
  } = {}
) {
  const esc =
    typeof escapeHtmlFn === "function"
      ? escapeHtmlFn
      : (value) => String(value ?? "");
  const display =
    itemOrText && typeof itemOrText === "object" && !Array.isArray(itemOrText)
      ? resolveDisplaySummary(itemOrText, { maxChars })
      : (() => {
          const full = String(itemOrText || "")
            .replace(/\s+/g, " ")
            .trim();
          const clipped = truncateSummaryAtWord(full, maxChars);
          return {
            preview: clipped.preview || "Summary unavailable.",
            full: clipped.full || "Summary unavailable.",
            truncated: clipped.truncated,
            isPlain: false,
          };
        })();

  const classes = ["summary-collapse", className].filter(Boolean).join(" ");
  const pClass = ["summary-collapse__text", paragraphClass]
    .filter(Boolean)
    .join(" ");

  if (!display.truncated) {
    return `<p class="${esc(pClass)}">${esc(display.preview)}</p>`;
  }

  return `<div class="${esc(classes)}">
    <p
      class="${esc(pClass)}"
      data-summary-preview="${esc(display.preview)}"
      data-summary-full="${esc(display.full)}"
    >${esc(display.preview)}</p>
    <button
      type="button"
      class="summary-collapse__toggle"
      data-summary-toggle
      aria-expanded="false"
    >Read More</button>
  </div>`;
}

function bindSummaryCollapseToggles(root = document) {
  if (!root || root.__summaryCollapseBound) return;
  root.__summaryCollapseBound = true;
  root.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-summary-toggle]");
    if (!button || !root.contains(button)) return;
    const wrap = button.closest(".summary-collapse");
    const textEl = wrap?.querySelector("[data-summary-full]");
    if (!textEl) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    if (expanded) {
      textEl.textContent = textEl.getAttribute("data-summary-preview") || "";
      button.setAttribute("aria-expanded", "false");
      button.textContent = "Read More";
    } else {
      textEl.textContent = textEl.getAttribute("data-summary-full") || "";
      button.setAttribute("aria-expanded", "true");
      button.textContent = "Show Less";
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      bindSummaryCollapseToggles(document)
    );
  } else {
    bindSummaryCollapseToggles(document);
  }
}

/**
 * Normalize vote-card props for Feed / politician Recent Votes / Truth in Voting.
 * Prefer Claude fields from processed_votes when present.
 */
function resolveVoteCardCopy(item = {}) {
  const yeaMeansRaw = String(
    item.yea_impact ||
      item.yeaImpact ||
      item.yeaMeans ||
      item.yea_means ||
      ""
  ).trim();
  const nayMeansRaw = String(
    item.nay_impact ||
      item.nayImpact ||
      item.nayMeans ||
      item.nay_means ||
      ""
  ).trim();
  const yeaClean = isGenericVoteMeans(yeaMeansRaw) ? "" : yeaMeansRaw;
  const nayClean = isGenericVoteMeans(nayMeansRaw) ? "" : nayMeansRaw;
  const yeaMeans = punchyImpactClause(yeaClean) || yeaClean;
  const nayMeans = punchyImpactClause(nayClean) || nayClean;
  const showMeans = Boolean(yeaMeans && nayMeans);

  const display = resolveDisplaySummary(item, { maxWords: 35 });
  const summary = display.preview;

  const shortTitle = String(
    item.short_title || item.shortTitle || item.displayTitle || ""
  ).trim();

  const yeaLabelRaw = String(item.yeaLabel || item.yea_label || "").trim();
  const nayLabelRaw = String(item.nayLabel || item.nay_label || "").trim();
  const yeaLabel = isShortVoteLabel(yeaLabelRaw)
    ? yeaLabelRaw
    : VOTE_CARD_DEFAULT_YEA_LABEL;
  const nayLabel = isShortVoteLabel(nayLabelRaw)
    ? nayLabelRaw
    : VOTE_CARD_DEFAULT_NAY_LABEL;

  return {
    summary,
    displaySummary: display,
    shortTitle,
    yeaMeans,
    nayMeans,
    showMeans,
    yeaLabel,
    nayLabel,
    meansAreGeneric: !showMeans,
  };
}

/**
 * Map a Supabase `processed_votes` row into the Votes feed card shape.
 */
function mapProcessedVoteToFeedItem(row = {}) {
  const rollCallId = String(row.roll_call_id || row.id || "").trim();
  const congress = Number(row.congress || 119);
  const sessionNumber = Number(row.session_number || 1);
  const rollCallNumber = Number(row.roll_call_number || 0);
  const billNumber = String(row.bill_number || "").trim() || null;
  const title =
    String(row.title || "").trim() ||
    String(row.vote_question || "").trim() ||
    (rollCallNumber ? `House Roll Call ${rollCallNumber}` : "Congressional vote");
  const summary = String(row.summary || "").trim();
  const voteQuestion = String(row.vote_question || "").trim();
  const result = String(row.result || "").trim();
  const dateRaw = row.vote_date;
  let date = null;
  if (dateRaw) {
    const raw = String(dateRaw).trim();
    date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw;
  }
  const chamber = String(row.chamber || "house").toLowerCase();
  const voteKind = String(row.vote_kind || "").trim() || null;
  const yeaMeans = String(row.yea_means || row.yeaMeans || "").trim();
  const nayMeans = String(row.nay_means || row.nayMeans || "").trim();
  const yeaLabel =
    String(row.yea_label || row.yeaLabel || "").trim() ||
    VOTE_CARD_DEFAULT_YEA_LABEL;
  const nayLabel =
    String(row.nay_label || row.nayLabel || "").trim() ||
    VOTE_CARD_DEFAULT_NAY_LABEL;
  const officialUrl =
    String(row.official_url || "").trim() ||
    String(row.clerk_url || "").trim() ||
    "#";
  const clerkUrl = String(row.clerk_url || "").trim() || officialUrl;
  const billId = String(row.bill_id || "").trim() || rollCallId;

  return {
    id: rollCallId || billId,
    billId: billId || rollCallId,
    rollCallId,
    billNumber: billNumber || (rollCallNumber ? `Roll Call ${rollCallNumber}` : ""),
    title,
    summary,
    officialSummary: summary,
    shortPitch: summary || title,
    yeaMeans,
    nayMeans,
    yeaLabel,
    nayLabel,
    level: "Federal",
    jurisdiction: chamber === "senate" ? "U.S. Senate" : "U.S. House",
    chamber,
    congress,
    sessionNumber,
    rollCallNumber,
    voteQuestion,
    voteKind,
    result,
    date,
    officialUrl,
    clerkUrl,
    policyArea: "",
    subjectCategory: "",
    tags: [],
    statusLabel: result || voteQuestion || "Roll-call vote",
    hasLinkedBill: Boolean(billNumber),
    summarySource: String(row.summary_source || "llm"),
    source: "processed_votes",
  };
}

const PROCESSED_VOTES_FEED_SELECT =
  "roll_call_id, bill_id, title, summary, yea_means, nay_means, yea_label, nay_label, short_title, plain_summary, what_it_does, yea_impact, nay_impact, bill_number, legislation_number, bill_type, result, vote_date, vote_question, vote_kind, chamber, congress, session_number, roll_call_number, official_url, clerk_url, summary_source, updated_at";

function normalizeLegislationType(type) {
  return String(type || "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();
}

function processedBillLookupKey(congress, billType, legislationNumber) {
  const c = Number(congress || 0);
  const t = normalizeLegislationType(billType);
  const n = String(legislationNumber || "").replace(/\D/g, "");
  if (!c || !t || !n) return "";
  return `${c}:${t}:${n}`;
}

function parseBillNumberParts(billNumber) {
  const match = String(billNumber || "")
    .trim()
    .match(/^([A-Za-z.]+)\s*(\d+)$/);
  if (!match) return null;
  return {
    billType: normalizeLegislationType(match[1]),
    legislationNumber: match[2],
  };
}

function billItemLookupKey(item = {}) {
  const id = String(item.id || item.billId || "").toLowerCase();
  const fromId = id.match(/federal-(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/);
  if (fromId) {
    return processedBillLookupKey(fromId[1], fromId[2], fromId[3]);
  }
  const parts = parseBillNumberParts(item.billNumber || item.bill_number);
  const congress = Number(item.congress || item.bill_congress || 0);
  if (parts && congress) {
    return processedBillLookupKey(
      congress,
      parts.billType,
      parts.legislationNumber
    );
  }
  if (item.bill_type && item.bill_number && congress) {
    return processedBillLookupKey(congress, item.bill_type, item.bill_number);
  }
  return "";
}

function voteDateMs(row = {}) {
  const raw = row.vote_date || row.updated_at || "";
  if (!raw) return 0;
  const date = new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function preferProcessedRow(candidate, existing) {
  if (!existing) return true;
  const candFinal =
    String(candidate.vote_kind || "").toLowerCase() === "final_passage" ? 1 : 0;
  const existFinal =
    String(existing.vote_kind || "").toLowerCase() === "final_passage" ? 1 : 0;
  if (candFinal !== existFinal) return candFinal > existFinal;
  const dateDiff = voteDateMs(candidate) - voteDateMs(existing);
  if (dateDiff) return dateDiff > 0;
  return (
    String(candidate.summary || "").trim().length >
    String(existing.summary || "").trim().length
  );
}

function indexProcessedVotesByBill(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!String(row?.summary || "").trim()) continue;
    let key = processedBillLookupKey(
      row.congress,
      row.bill_type,
      row.legislation_number
    );
    if (!key) {
      const parts = parseBillNumberParts(row.bill_number || row.bill_id);
      if (parts) {
        key = processedBillLookupKey(
          row.congress,
          parts.billType,
          parts.legislationNumber
        );
      }
    }
    if (!key) continue;
    const prev = map.get(key);
    if (preferProcessedRow(row, prev)) map.set(key, row);
  }
  return map;
}

function applyProcessedSummaryToBillItem(item, row) {
  if (!item || !row) return item;
  const plain = String(
    row.card_summary || row.plain_summary || row.what_it_does || ""
  ).trim();
  const summary = plain || String(row.summary || "").trim();
  if (!summary) return item;
  item.plain_summary = plain || summary;
  item.plainSummary = plain || summary;
  item.plainEnglishSummary = plain || summary;
  item.what_it_does = plain || summary;
  item.card_summary = String(row.card_summary || plain || summary).trim();
  item.cardSummary = item.card_summary;
  if (row.takeaway) item.takeaway = String(row.takeaway).trim();
  if (row.key_points) {
    item.key_points = row.key_points;
    item.keyPoints = row.key_points;
  }
  if (row.pro_argument) {
    item.pro_argument = String(row.pro_argument).trim();
    item.proArgument = item.pro_argument;
  }
  if (row.con_argument) {
    item.con_argument = String(row.con_argument).trim();
    item.conArgument = item.con_argument;
  }
  item.shortPitch = summary;
  item.summary = summary;
  item.officialSummary = summary;
  item.summarySource = String(row.summary_source || "processed_votes");
  if (row.short_title) {
    item.short_title = String(row.short_title).trim();
    item.shortTitle = item.short_title;
  }
  return item;
}

function applyProcessedSummariesToBillItems(items = [], rows = []) {
  if (!items.length || !rows.length) return items;
  const byBill = indexProcessedVotesByBill(rows);
  for (const item of items) {
    if (String(item.level || "").toLowerCase() !== "federal") continue;
    const key = billItemLookupKey(item);
    if (!key) continue;
    const row = byBill.get(key);
    if (row) applyProcessedSummaryToBillItem(item, row);
  }
  return items;
}

const AVATAR_PRESETS = [
  { id: "slate", label: "Slate", from: "#334155", to: "#0f172a" },
  { id: "emerald", label: "Emerald", from: "#059669", to: "#064e3b" },
  { id: "ocean", label: "Ocean", from: "#2563eb", to: "#1e3a8a" },
  { id: "amber", label: "Amber", from: "#d97706", to: "#78350f" },
  { id: "rose", label: "Rose", from: "#e11d48", to: "#881337" },
  { id: "violet", label: "Violet", from: "#7c3aed", to: "#4c1d95" },
];

function avatarPresetId(avatarUrl = "") {
  const match = String(avatarUrl || "").match(/^preset:([a-z0-9_-]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function findAvatarPreset(id) {
  return AVATAR_PRESETS.find((preset) => preset.id === id) || null;
}

function profileInitials(label = "") {
  const parts = String(label || "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function profileFirstName(profile = {}, user = null) {
  const display = String(profile.display_name || "").trim();
  if (display) return display.split(/\s+/)[0];
  const username = String(profile.username || "").trim();
  if (username) return username;
  const email = String(profile.email || user?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "Account";
}

function resolveAvatarUrl(avatarUrl = "") {
  const value = String(avatarUrl || "").trim();
  if (!value) return "";
  if (/^preset:/i.test(value)) return "";
  return value;
}

function applyAvatarElement(el, { avatarUrl = "", label = "" } = {}) {
  if (!el) return;
  const presetId = avatarPresetId(avatarUrl);
  const preset = findAvatarPreset(presetId);
  const imageUrl = resolveAvatarUrl(avatarUrl);
  const initials = profileInitials(label);

  el.classList.add("user-avatar");
  el.replaceChildren();

  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "user-avatar__img";
    img.src = imageUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      el.replaceChildren();
      el.style.background = "linear-gradient(135deg, #334155, #0f172a)";
      el.textContent = initials;
      el.removeAttribute("data-avatar-image");
    });
    el.style.background = "";
    el.dataset.avatarImage = "1";
    el.append(img);
    return;
  }

  el.removeAttribute("data-avatar-image");
  if (preset) {
    el.style.background = `linear-gradient(135deg, ${preset.from}, ${preset.to})`;
  } else {
    el.style.background = "linear-gradient(135deg, #334155, #0f172a)";
  }
  el.textContent = initials;
}

async function compressImageFile(file, { maxSize = 256, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Could not process image.");
  return blob;
}

async function uploadProfileAvatar(userId, file) {
  const client = getSupabase();
  if (!client || !userId) throw new Error("Not signed in.");
  const blob = await compressImageFile(file);
  const path = `${userId}/avatar.jpg`;

  try {
    const { error } = await client.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) throw error;
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error("Missing public avatar URL.");
    return `${publicUrl}?v=${Date.now()}`;
  } catch (error) {
    // Fallback when storage bucket/policies are not configured yet.
    console.warn("Avatar storage upload failed; using inline image.", error);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl || dataUrl.length > 180000) {
      throw new Error(
        "Image is too large to save without Storage. Run migration-profile-avatar.sql in Supabase, then try again."
      );
    }
    return dataUrl;
  }
}

/**
 * Action Match helpers — humanize amendment titles + Yea/Nay context.
 */

const POLICY_CATEGORIES = [
  "Economy & Taxes",
  "Healthcare",
  "Immigration & Border",
  "Housing & Infrastructure",
  "Foreign Policy & Defense",
  "Civil Rights & Justice",
  "Energy & Environment",
  "Education & Labor",
];

const POLICY_CATEGORY_BADGE_LABELS = {
  "Economy & Taxes": "ECONOMY",
  Healthcare: "HEALTHCARE",
  "Immigration & Border": "IMMIGRATION",
  "Housing & Infrastructure": "HOUSING",
  "Foreign Policy & Defense": "FOREIGN POLICY",
  "Civil Rights & Justice": "CIVIL RIGHTS",
  "Energy & Environment": "ENERGY",
  "Education & Labor": "EDUCATION",
};

function collapseMatchWs(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatchSentence(text, maxChars = 320) {
  const cleaned = collapseMatchWs(text);
  if (!cleaned) return "";
  // Avoid splitting on common abbreviations (U.S., F.Y., No., Amdt.).
  const protectedText = cleaned
    .replace(/\bU\.S\./gi, "US")
    .replace(/\bF\.Y\.?/gi, "FY")
    .replace(/\bNo\./gi, "No")
    .replace(/\bAmdt\./gi, "Amdt")
    .replace(/\b[A-Z]\.(?=[A-Za-z])/g, (m) => m.replace(".", ""));
  const match = protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/);
  let sentence = collapseMatchWs(match ? match[0] : protectedText);
  sentence = sentence.replace(/\bUS\b/g, "U.S.");
  // Never ellipsize mid-sentence (avoids "convicted of sexual…").
  // Prefer the full grammatical sentence even when slightly over maxChars.
  if (sentence.length > maxChars && !/[.!?]$/.test(sentence)) {
    // Incomplete fragment: keep whole fragment and close it — do not chop words.
    sentence = `${sentence.replace(/[,:;–—-]+$/, "")}.`;
    return sentence;
  }
  if (sentence && !/[.!?]$/.test(sentence)) sentence = `${sentence}.`;
  return sentence;
}

function splitMatchSentences(text = "") {
  const cleaned = collapseMatchWs(text);
  if (!cleaned) return [];
  const protectedText = cleaned
    .replace(/\bU\.S\./gi, "US")
    .replace(/\bF\.Y\.?/gi, "FY")
    .replace(/\bNo\./gi, "No")
    .replace(/\bAmdt\./gi, "Amdt");
  return (
    protectedText
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((part) => collapseMatchWs(part).replace(/\bUS\b/g, "U.S."))
      .filter(Boolean) || []
  );
}

/** Enforce ≤2 complete sentences for Action Match card summaries. */
function clampPunchySummary(text = "", { maxSentences = 2, maxWords = 55 } = {}) {
  const sentences = splitMatchSentences(text).slice(0, maxSentences);
  if (!sentences.length) return "";
  let out = sentences.join(" ");
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    // Prefer one full sentence over chopping mid-phrase ("sexual assault" → "sexual").
    const first = sentences[0] || "";
    out = /[.!?]$/.test(first)
      ? first
      : `${first.replace(/[,:;–—-]+$/, "")}.`;
  } else if (!/[.!?]$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}

/**
 * Turn a raw yea/nay impact into a one-line clause (≤14 words).
 * Strips "Votes to…", "A Yea vote means…", etc.
 */
function punchyImpactClause(text = "", { maxWords = 28 } = {}) {
  let out = collapseMatchWs(text);
  if (!out) return "";
  out = out
    .replace(/^a (yea|nay) vote means\s+/i, "")
    .replace(/^votes?\s+(yes|no|yea|nay)?\s*(to|for|against)?\s*/i, "")
    .replace(/^(supports?|opposes?|supported|opposed)\s+/i, "")
    .replace(/^to\s+/i, "");
  const first = splitMatchSentences(out)[0] || out;
  let words = collapseMatchWs(first.replace(/[.!?]+$/, ""))
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > maxWords) {
    // Walk back so we do not end on a dangling preposition/article/adjective stub.
    const weak = /^(of|the|a|an|and|or|for|to|with|by|in|on|at|from|into|that|which|who|their|its|or)$/i;
    let end = maxWords;
    while (end > Math.floor(maxWords * 0.65) && weak.test(words[end - 1] || "")) {
      end -= 1;
    }
    words = words.slice(0, end);
  }
  return words.join(" ");
}

/** Best-effort infinitive → gerund for punchy stance lines. */
function toGerundPhrase(clause = "") {
  const text = collapseMatchWs(clause);
  if (!text) return "";
  if (/^\w+ing\b/i.test(text)) return text;
  const match = text.match(/^([A-Za-z]+)(.*)$/);
  if (!match) return text;
  let verb = match[1];
  const rest = match[2] || "";
  const lower = verb.toLowerCase();
  if (lower.endsWith("ie")) verb = `${verb.slice(0, -2)}ying`;
  else if (lower.endsWith("e") && !lower.endsWith("ee")) {
    verb = `${verb.slice(0, -1)}ing`;
  } else {
    verb = `${verb}ing`;
  }
  if (/^[A-Z]/.test(match[1])) {
    verb = verb.charAt(0).toUpperCase() + verb.slice(1);
  }
  return `${verb}${rest}`;
}

/**
 * One-line stance statement for Agree/Differ footers.
 * e.g. "Supported adding $70B to border security"
 */
function formatStanceImpactLine(rawImpact, polarity) {
  const clause = toGerundPhrase(punchyImpactClause(rawImpact));
  if (!clause) return "—";
  const isOppose =
    polarity === "oppose" ||
    polarity === "nay" ||
    polarity === "no";
  const verb = isOppose ? "Opposed" : "Supported";
  const body = clause.charAt(0).toLowerCase() + clause.slice(1);
  return `${verb} ${body}`;
}

function stanceBadgeTone(label = "") {
  const value = String(label || "").toLowerCase();
  if (/^(yea|aye|yes|support)/.test(value)) return "yea";
  if (/^(nay|no|oppose)/.test(value)) return "nay";
  return "neutral";
}

function parseAmendmentAttribution(title = "") {
  const raw = collapseMatchWs(title);
  if (!raw) return null;
  const match = raw.match(
    /(?:Re:\s*)?([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,3})\s+Amdt\.?\s*(?:No\.?\s*)?(\d+)/i
  );
  if (!match) return null;
  return {
    sponsor: collapseMatchWs(match[1]),
    number: match[2],
    label: `${collapseMatchWs(match[1])} Amdt. ${match[2]}`,
  };
}

function topicFromPitch(pitch = "") {
  let text = firstMatchSentence(pitch, 280).replace(/\.$/, "");
  if (!text) return "";
  text = text.replace(
    /^This (amendment|motion|bill|measure|vote|package)\s+/i,
    ""
  );
  text = text.replace(
    /^(allows the (Senate|House) to |allows Congress to |would |will )/i,
    ""
  );

  const forMatch = text.match(
    /\bfor\s+(.+?)(?:\s+through\b|\s+while\b|\s+and related\b|\.|$)/i
  );
  if (forMatch) {
    let topic = collapseMatchWs(forMatch[1]).replace(/,$/, "");
    topic = topic.replace(/,?\s+and related.*$/i, "").trim();
    if (topic.length >= 12) {
      topic = topic.charAt(0).toUpperCase() + topic.slice(1);
      if (topic.length > 72) {
        topic = `${topic.slice(0, 69).replace(/\s+\S*$/, "")}…`;
      }
      return topic;
    }
  }

  const allocates = text.match(
    /^(?:allocates|provides|authorizes|requires|establishes|expands|creates)\s+(.+)$/i
  );
  if (allocates) {
    let topic = collapseMatchWs(allocates[1]);
    const purpose = topic.match(/\bfor\s+(.+)$/i);
    if (purpose) topic = purpose[1];
    topic = topic.replace(/,?\s+and related.*$/i, "").trim();
    if (topic.length > 72) {
      topic = `${topic.slice(0, 69).replace(/\s+\S*$/, "")}…`;
    }
    return topic.charAt(0).toUpperCase() + topic.slice(1);
  }

  if (text.length > 72) {
    text = `${text.slice(0, 69).replace(/\s+\S*$/, "")}…`;
  }
  return text;
}

function cleanRawMatchTitle(title = "", billNumber = "") {
  let text = collapseMatchWs(title);
  const number = collapseMatchWs(billNumber);
  if (!text) return number || "Congressional roll call";
  // Strip duplicated bill-number prefixes: "S. 2 S. 2: …" / "S. 2: S. 2: …"
  if (number) {
    const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^(?:${escaped}\\s*:?\\s*)+`, "i");
    text = text.replace(re, "").trim();
  }
  text = text.replace(/^(seed|placeholder)\s*:\s*/i, "");
  return text || number || "Congressional roll call";
}

function formatAmendmentCodePill(bill = {}, voteCopy = null) {
  const rawTitle = collapseMatchWs(
    voteCopy?.title || bill.title || bill.bill_number || bill.billNumber || ""
  );
  const attribution = parseAmendmentAttribution(rawTitle);
  if (attribution) {
    return `${attribution.sponsor} Amdt. No. ${attribution.number}`;
  }
  const cleaned = cleanRawMatchTitle(
    rawTitle,
    bill.bill_number || bill.billNumber || ""
  );
  if (cleaned && !/^congressional roll call$/i.test(cleaned)) return cleaned;
  return collapseMatchWs(bill.bill_number || bill.billNumber || "") || "";
}

function looksLikeAmendmentCode(text = "") {
  return /amdt\.?\s*(?:no\.?\s*)?\d+/i.test(String(text || ""));
}

/**
 * Build a plain-English Action Match card title.
 * Priority: Claude short_title → topic from plain_summary → raw title.
 */
function humanizeActionMatchTitle(bill = {}, voteCopy = null) {
  const shortTitle = collapseMatchWs(
    voteCopy?.short_title || voteCopy?.shortTitle || ""
  );
  if (shortTitle && !looksLikeAmendmentCode(shortTitle)) {
    return shortTitle;
  }

  const number = collapseMatchWs(bill.bill_number || bill.billNumber || "");
  const rawTitle = collapseMatchWs(voteCopy?.title || bill.title || "");
  const pitch =
    collapseMatchWs(
      voteCopy?.plain_summary ||
        voteCopy?.plainSummary ||
        voteCopy?.what_it_does ||
        voteCopy?.whatItDoes ||
        ""
    ) ||
    collapseMatchWs(voteCopy?.summary || "") ||
    collapseMatchWs(bill.short_pitch || bill.shortPitch || "");
  const fromPitch = topicFromPitch(pitch);
  if (fromPitch && !looksLikeAmendmentCode(fromPitch)) {
    return fromPitch;
  }

  // Explicit fallback: raw Senate/House title string.
  return rawTitle || number || "Congressional roll call";
}

/**
 * Resolve header/body copy for an Action Match agree/differ card.
 * Prefer Claude fields on the enriched vote (`short_title`, `plain_summary` / `card_summary`).
 */
function resolveActionMatchCardCopy(row = {}) {
  const bill = row.bill || {};
  const voteCopy = row.voteCopy || row.vote || null;
  const impact =
    row.impact || buildActionMatchImpact(bill, voteCopy, row);
  // vote.short_title from processed_votes is the primary card heading.
  const claudeTitle = collapseMatchWs(
    voteCopy?.short_title ||
      voteCopy?.shortTitle ||
      row.short_title ||
      row.shortTitle ||
      ""
  );
  const impactTitle = collapseMatchWs(
    impact.short_title || row.displayTitle || ""
  );
  const shortTitle =
    (claudeTitle && !looksLikeAmendmentCode(claudeTitle) ? claudeTitle : "") ||
    (impactTitle && !looksLikeAmendmentCode(impactTitle) ? impactTitle : "") ||
    collapseMatchWs(bill.title || voteCopy?.title || "") ||
    collapseMatchWs(bill.bill_number || bill.billNumber || row.bill_id || "") ||
    "Congressional roll call";
  const rawCode = collapseMatchWs(
    impact.raw_code || formatAmendmentCodePill(bill, voteCopy)
  );
  const cardSummary =
    clampPunchySummary(
      voteCopy?.card_summary ||
        voteCopy?.cardSummary ||
        voteCopy?.plain_summary ||
        voteCopy?.plainSummary ||
        row.card_summary ||
        row.plain_summary ||
        row.plainSummary ||
        impact.card_summary ||
        impact.plain_summary ||
        impact.what_it_does ||
        row.detailSummary ||
        voteCopy?.summary ||
        bill.short_pitch ||
        bill.shortPitch ||
        "",
      { maxSentences: 2, maxWords: 35 }
    ) || "No plain-English summary is available for this roll call yet.";
  const takeaway =
    collapseMatchWs(
      voteCopy?.takeaway ||
        row.takeaway ||
        impact.takeaway ||
        shortTitle
    ) || shortTitle;
  const keyPoints = normalizeMatchKeyPoints(
    voteCopy?.key_points ||
      voteCopy?.keyPoints ||
      row.key_points ||
      impact.key_points,
    [
      cardSummary,
      impact.yea_impact,
      impact.nay_impact,
    ]
  );
  const proArgument =
    clampPunchySummary(
      voteCopy?.pro_argument ||
        voteCopy?.proArgument ||
        impact.pro_argument ||
        impact.yea_impact ||
        "",
      { maxSentences: 1, maxWords: 28 }
    ) || "Supporters want to advance this measure.";
  const conArgument =
    clampPunchySummary(
      voteCopy?.con_argument ||
        voteCopy?.conArgument ||
        impact.con_argument ||
        impact.nay_impact ||
        "",
      { maxSentences: 1, maxWords: 28 }
    ) || "Opponents want to block this measure.";
  const detailHref =
    row.detailHref || actionMatchDetailHref(bill, voteCopy);
  const yourStanceImpactLine =
    impact.your_stance_line ||
    formatStanceImpactLine(
      impact.your_stance_impact || impact.yea_impact,
      String(row.user_stance || impact.your_stance_label || "").toLowerCase()
    );
  const repVoteLabel = impact.rep_stance_label || "—";
  const repImpactCore =
    impact.rep_stance_line_core ||
    formatStanceImpactLine(
      impact.rep_stance_impact || impact.nay_impact,
      /^(nay|no)$/i.test(String(row.member_vote || repVoteLabel))
        ? "oppose"
        : "support"
    );
  const repStanceImpactLine =
    impact.rep_stance_line ||
    (/^(yea|aye|yes|nay|no)$/i.test(String(repVoteLabel))
      ? `Voted ${repVoteLabel} — ${repImpactCore}`
      : repImpactCore);
  const matched =
    row.matched === true ? true : row.matched === false ? false : null;
  const matchReason =
    matched === true
      ? `You aligned — both ${
          /oppose/i.test(String(impact.your_stance_label || ""))
            ? "opposed"
            : "supported"
        } this change.`
      : matched === false
        ? `You ${
            /oppose/i.test(String(impact.your_stance_label || ""))
              ? "opposed"
              : "supported"
          }; they voted ${repVoteLabel}.`
        : yourStanceImpactLine;
  const category = inferMatchCategory(row, bill, voteCopy);
  const categoryBadge = formatPolicyCategoryBadge(category);
  const resultLabel = collapseMatchWs(
    voteCopy?.result || row.vote_result || row.result || ""
  );
  const rollMeta = buildRollCallMeta(voteCopy, row);

  return {
    bill,
    voteCopy,
    impact,
    shortTitle,
    rawCode,
    showCode:
      Boolean(rawCode) &&
      rawCode.toLowerCase() !== String(shortTitle).toLowerCase(),
    plainSummary: cardSummary,
    cardSummary,
    takeaway,
    keyPoints,
    proArgument,
    conArgument,
    detailHref,
    category,
    categoryBadge,
    matched,
    matchReason,
    resultLabel,
    rollMeta,
    yourStanceLabel: impact.your_stance_label || "Your stance",
    yourStanceImpact: yourStanceImpactLine,
    yourStanceTone: stanceBadgeTone(impact.your_stance_label || row.user_stance),
    repStanceLabel: repVoteLabel,
    repStanceImpact: repStanceImpactLine,
    repStanceTone: stanceBadgeTone(repVoteLabel),
    yeaImpact: impact.yea_impact || "",
    nayImpact: impact.nay_impact || "",
  };
}

function normalizeMatchKeyPoints(value, fallbacks = []) {
  let points = [];
  if (Array.isArray(value)) {
    points = value.map((item) => collapseMatchWs(item)).filter(Boolean);
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        points = parsed.map((item) => collapseMatchWs(item)).filter(Boolean);
      }
    } catch {
      points = [];
    }
  }
  for (const fallback of fallbacks) {
    if (points.length >= 3) break;
    const text = collapseMatchWs(fallback);
    if (text && !points.includes(text)) points.push(text);
  }
  while (points.length < 3) {
    points.push(
      [
        "This vote changes how a federal policy works in practice.",
        "It affects people or communities tied to the issue.",
        "Supporters and opponents disagree about the tradeoffs.",
      ][points.length]
    );
  }
  return points.slice(0, 3);
}

function normalizePolicyCategory(value, haystack = "") {
  const raw = collapseMatchWs(value);
  const exact = POLICY_CATEGORIES.find(
    (category) => category.toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact;

  const lower = `${raw} ${haystack}`.toLowerCase();
  const aliasMap = [
    [/immigra|border|asylum|visa|deport|refugee|customs/, "Immigration & Border"],
    [/health|medicare|medicaid|hospital|pharma|vaccine|aca/, "Healthcare"],
    [
      /hous|rent|mortgage|homeless|infra|transit|highway|bridge/,
      "Housing & Infrastructure",
    ],
    [
      /foreign|defense|military|war|nato|troop|sanction/,
      "Foreign Policy & Defense",
    ],
    [
      /civil|justice|voting|police|prison|gun|court|rights/,
      "Civil Rights & Justice",
    ],
    [
      /energy|environ|climate|epa|emission|oil|gas|renewable/,
      "Energy & Environment",
    ],
    [/educat|school|student|labor|union|wage|worker|osha/, "Education & Labor"],
    [
      /tax|budget|economy|spend|deficit|debt|tariff|irs|fee|payroll/,
      "Economy & Taxes",
    ],
  ];
  for (const [re, category] of aliasMap) {
    if (re.test(lower)) return category;
  }
  return "Economy & Taxes";
}

function formatPolicyCategoryBadge(category = "") {
  const normalized = normalizePolicyCategory(category);
  return (
    POLICY_CATEGORY_BADGE_LABELS[normalized] ||
    String(normalized || "POLICY")
      .replace(/&/g, " ")
      .toUpperCase()
  );
}

function inferMatchCategory(row = {}, bill = {}, voteCopy = null) {
  const explicit =
    voteCopy?.primary_category ||
    voteCopy?.primaryCategory ||
    row.primary_category ||
    row.category ||
    bill.category ||
    voteCopy?.category ||
    (Array.isArray(bill.tags) ? bill.tags[0] : "") ||
    "";
  const hay = `${bill.title || ""} ${voteCopy?.title || ""} ${
    voteCopy?.plain_summary || voteCopy?.card_summary || voteCopy?.takeaway || ""
  }`;
  return normalizePolicyCategory(explicit, hay);
}

function buildRollCallMeta(voteCopy = null, row = {}) {
  const result = collapseMatchWs(
    voteCopy?.result || row.vote_result || row.result || ""
  );
  const chamber = collapseMatchWs(
    voteCopy?.chamber || row.chamber || ""
  );
  const roll = voteCopy?.roll_call_number || row.roll_call_number || "";
  const date = collapseMatchWs(
    voteCopy?.vote_date || row.vote_date || ""
  );
  const raw = voteCopy?.raw_payload || row.raw_payload || null;
  let yeaCount = null;
  let nayCount = null;
  if (raw && typeof raw === "object") {
    yeaCount =
      raw.yeaTotal ??
      raw.yesTotal ??
      raw.democraticYea ??
      raw.RepublicanYea ??
      null;
    nayCount =
      raw.nayTotal ??
      raw.noTotal ??
      raw.democraticNay ??
      raw.RepublicanNay ??
      null;
    // House API sometimes nests totals.
    if (yeaCount == null && raw.voteTotals) {
      yeaCount = raw.voteTotals.yeaTotal ?? raw.voteTotals.yes ?? null;
      nayCount = raw.voteTotals.nayTotal ?? raw.voteTotals.no ?? null;
    }
  }
  return {
    result: result || "Result unavailable",
    chamber: chamber || "",
    rollCallNumber: roll ? String(roll) : "",
    date: date ? String(date).slice(0, 10) : "",
    yeaCount: yeaCount != null ? Number(yeaCount) : null,
    nayCount: nayCount != null ? Number(nayCount) : null,
  };
}

/**
 * Render one Where You Agree / Differ list item — progressive disclosure.
 * Tier 1: compact row. Tier 2: accordion. Tier 3: deep-dive via payload.
 */
function renderActionMatchScorecardItem(row, escapeHtmlFn) {
  const esc =
    typeof escapeHtmlFn === "function"
      ? escapeHtmlFn
      : (value) => String(value ?? "");
  const copy = resolveActionMatchCardCopy(row);
  const detailPayload = encodeURIComponent(
    JSON.stringify({
      title: copy.shortTitle,
      number: copy.rawCode,
      summary: copy.cardSummary,
      cardSummary: copy.cardSummary,
      takeaway: copy.takeaway,
      keyPoints: copy.keyPoints,
      proArgument: copy.proArgument,
      conArgument: copy.conArgument,
      yea: copy.yeaImpact,
      nay: copy.nayImpact,
      href: copy.detailHref,
      rawTitle: copy.bill.title || "",
      stance: row.user_stance || "",
      memberVote: row.member_vote || "",
      yourStanceLabel: copy.yourStanceLabel,
      yourStanceImpact: copy.yourStanceImpact,
      repStanceLabel: copy.repStanceLabel,
      repStanceImpact: copy.repStanceImpact,
      matched: copy.matched,
      matchReason: copy.matchReason,
      category: copy.category,
      resultLabel: copy.resultLabel,
      rollMeta: copy.rollMeta,
    })
  );
  const yourPillTone = copy.yourStanceTone || "neutral";
  const repPillTone = copy.repStanceTone || "neutral";
  const matchTone =
    copy.matched === true ? "match" : copy.matched === false ? "differ" : "neutral";
  const matchLabel =
    copy.matched === true
      ? "Match"
      : copy.matched === false
        ? "Differ"
        : "Compared";
  const yourPill = /oppose/i.test(String(copy.yourStanceLabel || ""))
    ? "You · Oppose"
    : "You · Support";
  const repPill = /^(nay|no)$/i.test(String(copy.repStanceLabel || ""))
    ? "Rep · Nay"
    : /^(yea|aye|yes)$/i.test(String(copy.repStanceLabel || ""))
      ? "Rep · Yea"
      : `Rep · ${copy.repStanceLabel || "—"}`;

  return `<li class="scorecard-match-item scorecard-match-item--compact" data-match-item data-category="${esc(
    copy.category
  )}">
      <button
        type="button"
        class="scorecard-match-item__row"
        data-toggle-match-accordion
        aria-expanded="false"
        aria-controls=""
      >
        <span class="scorecard-match-item__row-main">
          <span class="scorecard-match-item__name">${esc(copy.shortTitle)}</span>
          <span class="scorecard-match-item__meta-row">
            <span class="scorecard-match-item__category">${esc(
              copy.categoryBadge || copy.category
            )}</span>
            <span class="scorecard-stance-pill scorecard-stance-pill--${yourPillTone}">${esc(
              yourPill
            )}</span>
            <span class="scorecard-stance-pill scorecard-stance-pill--${repPillTone}">${esc(
              repPill
            )}</span>
            <span class="scorecard-match-indicator scorecard-match-indicator--${matchTone}">${esc(
              matchLabel
            )}</span>
          </span>
        </span>
        <span class="scorecard-match-item__chevron" aria-hidden="true"></span>
      </button>
      <div class="scorecard-match-item__accordion" hidden>
        <p class="scorecard-match-item__summary">${esc(copy.cardSummary)}</p>
        <p class="scorecard-match-item__reason">${esc(copy.matchReason)}</p>
        <button
          type="button"
          class="scorecard-match-item__deep-link"
          data-open-match-detail="${detailPayload}"
        >Explore Full Bill Breakdown &amp; Roll Call →</button>
      </div>
    </li>`;
}

/**
 * Structured Action Match impact fields for agree/differ cards.
 */
function buildActionMatchImpact(bill = {}, voteCopy = null, matchRow = null) {
  const means = buildActionMatchVoteMeans(bill, voteCopy);
  const short_title = humanizeActionMatchTitle(bill, voteCopy);
  const raw_code = formatAmendmentCodePill(bill, voteCopy);
  const plain_summary =
    clampPunchySummary(
      voteCopy?.card_summary ||
        voteCopy?.cardSummary ||
        voteCopy?.plain_summary ||
        voteCopy?.plainSummary ||
        voteCopy?.what_it_does ||
        voteCopy?.whatItDoes ||
        voteCopy?.summary ||
        bill.short_pitch ||
        bill.shortPitch ||
        "",
      { maxSentences: 2, maxWords: 35 }
    ) || "No plain-English summary is available for this roll call yet.";
  const what_it_does = plain_summary;
  const card_summary = plain_summary;
  const takeaway =
    collapseMatchWs(voteCopy?.takeaway || "") || short_title;
  const yea_impact =
    punchyImpactClause(voteCopy?.yea_impact || voteCopy?.yeaImpact || "") ||
    punchyImpactClause(voteCopy?.pro_argument || "") ||
    punchyImpactClause(means.yea) ||
    "Advancing this measure as written";
  const nay_impact =
    punchyImpactClause(voteCopy?.nay_impact || voteCopy?.nayImpact || "") ||
    punchyImpactClause(voteCopy?.con_argument || "") ||
    punchyImpactClause(means.nay) ||
    "Rejecting this measure";
  const pro_argument =
    clampPunchySummary(
      voteCopy?.pro_argument || voteCopy?.proArgument || "",
      { maxSentences: 1, maxWords: 28 }
    ) || `Supporters back ${yea_impact.charAt(0).toLowerCase()}${yea_impact.slice(1)}.`;
  const con_argument =
    clampPunchySummary(
      voteCopy?.con_argument || voteCopy?.conArgument || "",
      { maxSentences: 1, maxWords: 28 }
    ) || `Opponents want to stop ${nay_impact.charAt(0).toLowerCase()}${nay_impact.slice(1)}.`;
  const key_points = normalizeMatchKeyPoints(
    voteCopy?.key_points || voteCopy?.keyPoints,
    [plain_summary, yea_impact, nay_impact]
  );

  const userStance = String(matchRow?.user_stance || "").toLowerCase();
  const memberVote = String(matchRow?.member_vote || "").toLowerCase();
  const yourStanceLabel =
    userStance === "support"
      ? "Support"
      : userStance === "oppose"
        ? "Oppose"
        : userStance || "Your stance";
  const yourPolarity = userStance === "oppose" ? "oppose" : "support";
  const yourStanceImpact =
    userStance === "oppose" ? nay_impact : yea_impact;
  const your_stance_line = formatStanceImpactLine(
    yourStanceImpact,
    yourPolarity
  );
  const repIsNay = /^(nay|no)$/.test(memberVote);
  const repIsYea = /^(yea|aye|yes)$/.test(memberVote);
  const repStanceLabel = repIsNay ? "Nay" : repIsYea ? "Yea" : memberVote || "—";
  const repStanceImpact = repIsNay
    ? nay_impact
    : repIsYea
      ? yea_impact
      : yea_impact;
  const rep_stance_line_core = formatStanceImpactLine(
    repStanceImpact,
    repIsNay ? "oppose" : "support"
  );
  const rep_stance_line =
    repIsYea || repIsNay
      ? `Voted ${repStanceLabel} — ${rep_stance_line_core}`
      : rep_stance_line_core;

  return {
    short_title,
    raw_code,
    plain_summary,
    what_it_does,
    card_summary,
    takeaway,
    key_points,
    pro_argument,
    con_argument,
    yea_impact,
    nay_impact,
    your_stance_label: yourStanceLabel,
    your_stance_impact: yourStanceImpact,
    your_stance_line,
    rep_stance_label: String(repStanceLabel)
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    rep_stance_impact: repStanceImpact,
    rep_stance_line_core,
    rep_stance_line,
  };
}

function buildActionMatchVoteMeans(bill = {}, voteCopy = null) {
  const yeaFromCopy = collapseMatchWs(voteCopy?.yea_means || voteCopy?.yeaMeans || "");
  const nayFromCopy = collapseMatchWs(voteCopy?.nay_means || voteCopy?.nayMeans || "");
  let yea =
    yeaFromCopy && !isGenericVoteMeans(yeaFromCopy) ? yeaFromCopy : "";
  let nay =
    nayFromCopy && !isGenericVoteMeans(nayFromCopy) ? nayFromCopy : "";

  if (yea && !/^a yea\b/i.test(yea)) {
    yea = `A Yea vote means ${yea.charAt(0).toLowerCase()}${yea
      .slice(1)
      .replace(/\.$/, "")}.`;
  }
  if (nay && !/^a nay\b/i.test(nay)) {
    nay = `A Nay vote means ${nay.charAt(0).toLowerCase()}${nay
      .slice(1)
      .replace(/\.$/, "")}.`;
  }
  if (yea && nay) return { yea, nay };

  const pitch = firstMatchSentence(
    voteCopy?.summary || bill.short_pitch || bill.shortPitch || "",
    180
  );
  if (pitch) {
    const clause = pitch
      .replace(/^This (amendment|motion|bill|measure|vote)\s+/i, "")
      .replace(/\.$/, "");
    return {
      yea: `A Yea vote supports ${clause}.`,
      nay: "A Nay vote rejects this change and leaves current law or procedure in place.",
    };
  }

  const attribution = parseAmendmentAttribution(bill.title || "");
  if (attribution) {
    return {
      yea: `A Yea vote supports the ${attribution.label}.`,
      nay: `A Nay vote rejects the ${attribution.label}.`,
    };
  }

  return {
    yea: "A Yea vote supports advancing this measure as written.",
    nay: "A Nay vote supports rejecting this measure.",
  };
}

function actionMatchDetailHref(bill = {}, voteCopy = null) {
  const official =
    collapseMatchWs(voteCopy?.official_url || bill.official_url || bill.officialUrl || "");
  if (official) return official;
  const id = collapseMatchWs(bill.id || bill.bill_id || "");
  if (id) {
    return `bills-policies.html?tab=votes&bill=${encodeURIComponent(id)}`;
  }
  return "bills-policies.html?tab=votes";
}

/**
 * Enrich stance_vote_matches rows with processed_votes plain-English copy.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {object[]} rows
 */
async function enrichActionMatchRows(client, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!client || !list.length) return list;

  const ids = [
    ...new Set(
      list
        .map((row) => String(row.bill_id || row.bill?.id || "").trim())
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return list;

  let data = null;
  let error = null;
  ({ data, error } = await client
    .from("processed_votes")
    .select(
      "roll_call_id, title, summary, yea_means, nay_means, short_title, plain_summary, what_it_does, yea_impact, nay_impact, card_summary, takeaway, key_points, pro_argument, con_argument, primary_category, bill_number, official_url, vote_kind, vote_question, result, chamber, roll_call_number, vote_date, raw_payload"
    )
    .in("roll_call_id", ids));
  // Older DBs may not have breakdown fields yet — retry without them.
  if (
    error &&
    /card_summary|takeaway|key_points|pro_argument|con_argument|raw_payload|primary_category/i.test(
      error.message || ""
    )
  ) {
    ({ data, error } = await client
      .from("processed_votes")
      .select(
        "roll_call_id, title, summary, yea_means, nay_means, short_title, plain_summary, what_it_does, yea_impact, nay_impact, bill_number, official_url, vote_kind, vote_question, result, chamber, roll_call_number, vote_date"
      )
      .in("roll_call_id", ids));
  }
  // Older DBs may not have plain_summary yet — retry without it.
  if (error && /plain_summary/i.test(error.message || "")) {
    ({ data, error } = await client
      .from("processed_votes")
      .select(
        "roll_call_id, title, summary, yea_means, nay_means, short_title, what_it_does, yea_impact, nay_impact, bill_number, official_url, vote_kind, vote_question"
      )
      .in("roll_call_id", ids));
  }
  // Older DBs may not have the impact columns yet.
  if (
    error &&
    /short_title|what_it_does|yea_impact|nay_impact/i.test(error.message || "")
  ) {
    ({ data, error } = await client
      .from("processed_votes")
      .select(
        "roll_call_id, title, summary, yea_means, nay_means, bill_number, official_url, vote_kind, vote_question"
      )
      .in("roll_call_id", ids));
  }
  if (error) {
    console.warn("processed_votes enrich failed:", error.message || error);
    return list;
  }

  const byId = new Map();
  for (const row of data || []) {
    if (row.roll_call_id) byId.set(String(row.roll_call_id), row);
  }

  return list.map((row) => {
    const voteCopy = byId.get(String(row.bill_id || "")) || null;
    const bill = row.bill || {};
    const impact = buildActionMatchImpact(bill, voteCopy, row);
    return {
      ...row,
      voteCopy,
      impact,
      category:
        voteCopy?.primary_category ||
        impact.primary_category ||
        (typeof inferMatchCategory === "function"
          ? inferMatchCategory(row, bill, voteCopy)
          : "Economy & Taxes"),
      displayTitle: impact.short_title,
      voteMeans: {
        yea: impact.yea_impact,
        nay: impact.nay_impact,
      },
      detailHref: actionMatchDetailHref(bill, voteCopy),
      detailSummary: impact.plain_summary || impact.what_it_does,
    };
  });
}


/**
 * Fill a Tier 3 Bill Breakdown modal/panel from an Action Match detail payload.
 * Works with scorecard-match-detail-* or politician-match-detail-* id prefixes.
 */
function fillBillBreakdownModal(payload = {}, options = {}) {
  const prefix = options.prefix || "scorecard-match-detail";
  const byId = (suffix) =>
    typeof document !== "undefined"
      ? document.getElementById(`${prefix}-${suffix}`)
      : null;

  const titleEl = byId("title");
  const billEl = byId("bill");
  const takeawayEl = byId("takeaway");
  const summaryEl = byId("summary");
  const pointsEl = byId("points");
  const proEl = byId("pro");
  const conEl = byId("con");
  const rollEl = byId("roll");
  const linkEl = byId("link");
  const stanceEl = byId("stance");

  if (titleEl) titleEl.textContent = payload.title || "Bill Breakdown";
  if (billEl) {
    billEl.textContent = payload.number || payload.rawTitle || "";
    billEl.hidden = !billEl.textContent;
  }
  if (takeawayEl) {
    takeawayEl.textContent =
      payload.takeaway || payload.title || "Congressional roll-call vote";
  }
  if (summaryEl) {
    summaryEl.textContent =
      payload.cardSummary ||
      payload.summary ||
      "No plain-English summary is available for this roll call yet.";
  }
  if (pointsEl) {
    const points = Array.isArray(payload.keyPoints)
      ? payload.keyPoints
      : [];
    pointsEl.innerHTML = points
      .slice(0, 3)
      .map((point) => `<li>${String(point || "").replace(/</g, "&lt;")}</li>`)
      .join("");
    pointsEl.hidden = !points.length;
  }
  if (proEl) {
    proEl.textContent =
      payload.proArgument || payload.yea || "Supporters want to advance this measure.";
  }
  if (conEl) {
    conEl.textContent =
      payload.conArgument || payload.nay || "Opponents want to block this measure.";
  }
  if (rollEl) {
    const meta = payload.rollMeta || {};
    const bits = [];
    if (meta.result) bits.push(meta.result);
    if (meta.chamber) bits.push(String(meta.chamber).replace(/\b\w/g, (c) => c.toUpperCase()));
    if (meta.rollCallNumber) bits.push(`Roll Call ${meta.rollCallNumber}`);
    if (meta.date) bits.push(meta.date);
    if (meta.yeaCount != null && meta.nayCount != null) {
      bits.push(`Yea ${meta.yeaCount} · Nay ${meta.nayCount}`);
    }
    rollEl.textContent = bits.join(" · ") || payload.resultLabel || "Roll-call totals unavailable.";
  }
  if (stanceEl) {
    const stance = payload.stance
      ? `You ${payload.stance}`
      : payload.yourStanceLabel
        ? `You: ${payload.yourStanceLabel}`
        : "";
    const member = payload.memberVote
      ? `They voted ${payload.memberVote}`
      : "";
    const match =
      payload.matched === true
        ? "Match"
        : payload.matched === false
          ? "Differ"
          : "";
    stanceEl.textContent = [stance, member, match].filter(Boolean).join(" · ");
    stanceEl.hidden = !stanceEl.textContent;
  }
  if (linkEl) {
    linkEl.href = payload.href || "bills-policies.html?tab=votes";
    linkEl.hidden = !linkEl.href;
  }

  const askPayload = {
    ...payload,
    congress_url:
      payload.congress_url ||
      payload.congressUrl ||
      payload.officialUrl ||
      payload.official_url ||
      payload.href ||
      "",
  };
  resetBillAskAi(prefix, askPayload);
  bindBillAskAi(prefix);
}

function resetBillAskAi(prefix = "scorecard-match-detail", payload = null) {
  if (typeof document === "undefined") return;
  const modal = document.getElementById(`${prefix}-modal`);
  const logEl = document.getElementById(`${prefix}-ask-log`);
  const statusEl = document.getElementById(`${prefix}-ask-status`);
  const inputEl = document.getElementById(`${prefix}-ask-input`);
  if (modal) {
    modal._askAiContext = payload || null;
    modal._askAiBillPayload = payload || null;
  }
  if (logEl) logEl.innerHTML = "";
  if (statusEl) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.className = "bill-ask-ai__status";
  }
  if (inputEl) inputEl.value = "";
  if (modal?._askAiAbort) {
    try {
      modal._askAiAbort.abort();
    } catch {
      /* ignore */
    }
    modal._askAiAbort = null;
  }
}

async function askAiAboutBill(prefix, question) {
  const modal = document.getElementById(`${prefix}-modal`);
  const logEl = document.getElementById(`${prefix}-ask-log`);
  const statusEl = document.getElementById(`${prefix}-ask-status`);
  const formEl = document.getElementById(`${prefix}-ask-form`);
  const inputEl = document.getElementById(`${prefix}-ask-input`);
  const chips = modal?.querySelectorAll("[data-ask-ai-chip]") || [];
  const payload = modal?._askAiContext || modal?._askAiBillPayload || null;
  const q = String(question || "").trim();
  if (!modal || !logEl || !q || !payload) return;

  if (modal._askAiAbort) {
    try {
      modal._askAiAbort.abort();
    } catch {
      /* ignore */
    }
  }
  const controller = new AbortController();
  modal._askAiAbort = controller;

  const userMsg = document.createElement("p");
  userMsg.className = "bill-ask-ai__msg bill-ask-ai__msg--user";
  userMsg.textContent = q;
  logEl.appendChild(userMsg);

  const assistantMsg = document.createElement("p");
  assistantMsg.className =
    "bill-ask-ai__msg bill-ask-ai__msg--assistant is-streaming";
  assistantMsg.textContent = "";
  logEl.appendChild(assistantMsg);
  logEl.scrollTop = logEl.scrollHeight;

  if (statusEl) {
    statusEl.hidden = false;
    statusEl.className = "bill-ask-ai__status";
    statusEl.textContent = "Thinking…";
  }
  if (inputEl) inputEl.value = "";
  const submitBtn = formEl?.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  chips.forEach((chip) => {
    chip.disabled = true;
  });

  const type = String(payload.type || "bill").toLowerCase() === "vote" ? "vote" : "bill";
  const requestBody =
    type === "vote"
      ? {
          question: q,
          type: "vote",
          context: payload,
          vote: {
            type: "vote",
            politicianName: payload.politicianName || "",
            voteCast: payload.voteCast || payload.votePosition || "",
            billTitle: payload.billTitle || payload.title || "",
            billNumber: payload.billNumber || payload.number || "",
            billSummary:
              payload.billSummary ||
              payload.summary ||
              payload.cardSummary ||
              "",
            takeaway: payload.takeaway || "",
            congress: payload.congress || null,
            billType: payload.billType || "",
            legislationNumber: payload.legislationNumber || "",
            billId: payload.billId || payload.id || "",
            congress_url:
              payload.congress_url ||
              payload.congressUrl ||
              payload.officialUrl ||
              "",
            officialUrl:
              payload.officialUrl ||
              payload.congress_url ||
              payload.href ||
              "",
            keyPoints: payload.keyPoints || [],
            proArgument: payload.proArgument || "",
            conArgument: payload.conArgument || "",
          },
        }
      : {
          question: q,
          type: "bill",
          context: payload,
          bill: {
            id: payload.id || "",
            title: payload.title || "",
            rawTitle: payload.rawTitle || "",
            number: payload.number || "",
            congress: payload.congress || null,
            billType: payload.billType || "",
            legislationNumber: payload.legislationNumber || "",
            takeaway: payload.takeaway || "",
            summary: payload.summary || "",
            cardSummary: payload.cardSummary || "",
            statusLabel: payload.statusLabel || "",
            keyPoints: payload.keyPoints || [],
            proArgument: payload.proArgument || payload.yea || "",
            conArgument: payload.conArgument || payload.nay || "",
            resultLabel: payload.resultLabel || "",
            rollMeta: payload.rollMeta || {},
            congress_url:
              payload.congress_url ||
              payload.congressUrl ||
              payload.officialUrl ||
              payload.official_url ||
              payload.href ||
              "",
            officialUrl:
              payload.officialUrl ||
              payload.official_url ||
              payload.congress_url ||
              payload.href ||
              "",
            href: payload.href || "",
          },
        };

  try {
    const response = await fetch("/api/chat-bill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let message = `Could not reach Ask AI (${response.status}).`;
      try {
        const errBody = await response.json();
        if (errBody?.error) message = errBody.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    const contentType = String(response.headers.get("content-type") || "");
    if (!contentType.includes("text/event-stream") || !response.body) {
      const data = await response.json().catch(() => ({}));
      const text = String(data.answer || data.text || data.error || "").trim();
      assistantMsg.textContent = text || "No answer returned.";
      assistantMsg.classList.remove("is-streaming");
      if (statusEl) statusEl.hidden = true;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let eventName = "message";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const line of parts) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }
        if (eventName === "token" && data.text) {
          full += data.text;
          assistantMsg.textContent = full;
          logEl.scrollTop = logEl.scrollHeight;
          if (statusEl) statusEl.textContent = "Writing…";
        } else if (eventName === "error") {
          throw new Error(data.error || "Ask AI failed.");
        } else if (eventName === "done") {
          eventName = "message";
        }
      }
    }

    if (!full.trim()) {
      assistantMsg.textContent =
        "I couldn’t find enough detail in this bill card to answer that.";
    } else if (typeof formatAskAiAnswerHtml === "function") {
      assistantMsg.innerHTML = formatAskAiAnswerHtml(full);
    }
    assistantMsg.classList.remove("is-streaming");
    if (statusEl) statusEl.hidden = true;
  } catch (error) {
    if (error?.name === "AbortError") return;
    assistantMsg.classList.remove("is-streaming");
    if (!assistantMsg.textContent) {
      assistantMsg.textContent =
        error?.message || "Could not answer that question right now.";
    }
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.className = "bill-ask-ai__status is-error";
      statusEl.textContent = error?.message || "Ask AI failed.";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    chips.forEach((chip) => {
      chip.disabled = false;
    });
    if (modal._askAiAbort === controller) modal._askAiAbort = null;
  }
}

function bindBillAskAi(prefix = "scorecard-match-detail") {
  if (typeof document === "undefined") return;
  const modal = document.getElementById(`${prefix}-modal`);
  const formEl = document.getElementById(`${prefix}-ask-form`);
  if (!modal || !formEl || formEl.dataset.boundAskAi === "1") return;
  formEl.dataset.boundAskAi = "1";

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const inputEl = document.getElementById(`${prefix}-ask-input`);
    askAiAboutBill(prefix, inputEl?.value || "");
  });

  modal.querySelectorAll("[data-ask-ai-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      askAiAboutBill(prefix, chip.textContent || "");
    });
  });
}

/** Normalize a feed / vote card item into Ask AI bill context. */
function formatAskAiAnswerHtml(text) {
  const escaped = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(/\n/g, "<br />");
}

function looksLikeLegislativeStatusText(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 420) return false;
  return /^(received in the (senate|house)|referred to the (committee|subcommittee)|passed\/agreed to|became public law|read (the )?(first|second) time|placed on (the )?(senate|house|legislative|union) calendar|introduced in the (house|senate)|message on (senate|house) action)/i.test(
    t
  );
}

function billAskAiPayloadFromItem(item = {}) {
  const keyPoints = Array.isArray(item.keyPoints)
    ? item.keyPoints
    : Array.isArray(item.key_points)
      ? item.key_points
      : [];
  const policySummary = String(
    (typeof preferPlainSummaryText === "function"
      ? preferPlainSummaryText(item)
      : "") ||
      item.cardSummary ||
      item.card_summary ||
      item.plain_summary ||
      item.plainSummary ||
      item.what_it_does ||
      ""
  ).trim();
  const rawPitch = String(
    item.shortPitch || item.summary || item.officialSummary || ""
  ).trim();
  const statusLabel = String(
    item.statusLabel || item.status_label || item.status?.stepName || ""
  ).trim();
  // Prefer real policy copy; keep status separate so Ask AI does not treat
  // "Received in the Senate…" as the bill's policy summary.
  let summary = policySummary;
  if (!summary && rawPitch && !looksLikeLegislativeStatusText(rawPitch)) {
    summary = rawPitch;
  }
  if (!summary && rawPitch && looksLikeLegislativeStatusText(rawPitch)) {
    summary = "";
  }
  const effectiveStatus =
    statusLabel ||
    (looksLikeLegislativeStatusText(rawPitch) ? rawPitch : "") ||
    "";

  const congressUrl = String(
    item.congress_url ||
      item.congressUrl ||
      item.officialUrl ||
      item.official_url ||
      item.clerkUrl ||
      item.clerk_url ||
      item.href ||
      ""
  ).trim();

  let congress =
    Number(item.congress || item.bill_congress || item.billCongress || 0) || 0;
  let billType = String(
    item.billType || item.bill_type || item.type || ""
  )
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
  let legislationNumber = String(
    item.legislationNumber || item.legislation_number || ""
  ).replace(/\D/g, "");

  const id = String(item.id || item.billId || "").toLowerCase();
  const fromId = id.match(/federal-(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/);
  if (fromId) {
    if (!congress) congress = Number(fromId[1]);
    if (!billType) billType = fromId[2];
    if (!legislationNumber) legislationNumber = fromId[3];
  }
  if ((!billType || !legislationNumber) && typeof parseBillNumberParts === "function") {
    const parts = parseBillNumberParts(item.billNumber || item.bill_number);
    if (parts) {
      if (!billType) billType = parts.billType;
      if (!legislationNumber) legislationNumber = parts.legislationNumber;
    }
  }
  if (!congress) congress = 119;

  return {
    id: String(item.id || item.billId || "").trim(),
    title: String(item.title || item.voteQuestion || "Untitled measure").trim(),
    rawTitle: String(item.rawTitle || item.title || "").trim(),
    number: String(
      item.billNumber ||
        item.bill_number ||
        (item.rollCallNumber ? `Roll Call ${item.rollCallNumber}` : "") ||
        ""
    ).trim(),
    congress,
    billType,
    legislationNumber,
    takeaway: String(
      item.takeaway || item.short_title || item.shortTitle || ""
    ).trim(),
    summary,
    cardSummary: summary,
    statusLabel: effectiveStatus,
    keyPoints,
    proArgument: String(
      item.proArgument ||
        item.pro_argument ||
        item.yeaMeans ||
        item.yea_means ||
        item.yea ||
        ""
    ).trim(),
    conArgument: String(
      item.conArgument ||
        item.con_argument ||
        item.nayMeans ||
        item.nay_means ||
        item.nay ||
        ""
    ).trim(),
    resultLabel: String(item.result || item.resultLabel || "").trim(),
    congress_url: congressUrl,
    congressUrl,
    officialUrl: congressUrl,
    official_url: congressUrl,
    href: congressUrl || String(item.href || "").trim(),
    rollMeta: {
      result: item.result || item.rollMeta?.result || "",
      chamber: item.chamber || item.rollMeta?.chamber || "",
      rollCallNumber:
        item.rollCallNumber ||
        item.roll_call_number ||
        item.rollMeta?.rollCallNumber ||
        null,
      date: item.date || item.vote_date || item.rollMeta?.date || "",
      yeaCount: item.yeaCount ?? item.rollMeta?.yeaCount ?? null,
      nayCount: item.nayCount ?? item.rollMeta?.nayCount ?? null,
    },
  };
}

/**
 * Reusable Ask AI drawer (vanilla equivalent of <AskAiDrawer />).
 * Supports context.type = "bill" | "vote" against the same /api/chat-bill endpoint.
 */
function normalizeAskAiVoteCastLabel(raw = "") {
  const value = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");
  if (!value) return "YEA";
  if (
    value === "YEA" ||
    value === "AYE" ||
    value === "YES" ||
    value === "SUPPORTED" ||
    value === "SUPPORT"
  ) {
    return "YEA";
  }
  if (
    value === "NAY" ||
    value === "NO" ||
    value === "OPPOSED" ||
    value === "OPPOSE"
  ) {
    return "NAY";
  }
  if (
    value.includes("PRESENT") ||
    value.includes("ABSTAIN") ||
    value.includes("NOT VOTING") ||
    value === "NV"
  ) {
    return "PRESENT";
  }
  return value;
}

function askAiPresetChips(context = {}) {
  const type = String(context.type || "bill").toLowerCase();
  if (type === "vote") {
    const cast = normalizeAskAiVoteCastLabel(
      context.voteCast || context.votePosition || "YEA"
    );
    return [
      `What does a ${cast} vote mean here?`,
      "What are the main arguments for and against?",
      "Who supported this measure?",
    ];
  }
  return [
    "How is this measure funded?",
    "Who is most impacted by this?",
    "What is the implementation timeline?",
  ];
}

function congressUrlFromBillParts(item = {}) {
  const existing = String(
    item.congress_url ||
      item.congressUrl ||
      item.officialUrl ||
      item.official_url ||
      item.href ||
      ""
  ).trim();
  if (existing) return existing;
  let congress =
    Number(item.congress || item.bill_congress || item.billCongress || 0) || 0;
  let billType = String(item.billType || item.bill_type || item.type || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
  let legislationNumber = String(
    item.legislationNumber || item.legislation_number || ""
  ).replace(/\D/g, "");
  if ((!billType || !legislationNumber) && typeof parseBillNumberParts === "function") {
    const parts = parseBillNumberParts(item.billNumber || item.bill_number || item.number);
    if (parts) {
      if (!billType) billType = parts.billType;
      if (!legislationNumber) legislationNumber = parts.legislationNumber;
    }
  }
  if (!congress) congress = 119;
  if (!billType || !legislationNumber) return "";
  return `https://www.congress.gov/bill/${congress}th-congress/${billType}/${legislationNumber}`;
}

function voteAskAiPayloadFromItem(item = {}, politicianName = "") {
  const billTitle = String(
    item.billTitle || item.title || item.voteQuestion || "Untitled measure"
  ).trim();
  const billNumber = String(item.billNumber || item.bill_number || item.number || "").trim();
  const billSummary = String(
    item.billSummary ||
      item.plainEnglishSummary ||
      item.plain_summary ||
      item.plainSummary ||
      item.cardSummary ||
      item.summary ||
      item.shortPitch ||
      ""
  ).trim();
  const voteCast = normalizeAskAiVoteCastLabel(
    item.voteCast || item.votePosition || item.vote_position || ""
  );
  const congressUrl = congressUrlFromBillParts(item);
  let congress = Number(item.congress || 0) || 0;
  let billType = String(item.billType || item.legislationType || "").toLowerCase();
  let legislationNumber = String(
    item.legislationNumber || item.legislation_number || ""
  ).replace(/\D/g, "");
  if ((!billType || !legislationNumber) && typeof parseBillNumberParts === "function") {
    const parts = parseBillNumberParts(billNumber);
    if (parts) {
      if (!billType) billType = parts.billType;
      if (!legislationNumber) legislationNumber = parts.legislationNumber;
    }
  }
  if (!congress) congress = 119;

  return {
    type: "vote",
    politicianName: String(politicianName || item.politicianName || "This legislator").trim(),
    voteCast,
    votePosition: voteCast,
    billTitle,
    billNumber,
    number: billNumber,
    title: billTitle,
    billSummary,
    summary: billSummary,
    cardSummary: billSummary,
    takeaway: String(item.takeaway || item.short_title || item.shortTitle || "").trim(),
    congress,
    billType,
    legislationNumber,
    billId: String(item.billId || item.id || "").trim(),
    id: String(item.billId || item.id || "").trim(),
    congress_url: congressUrl,
    congressUrl,
    officialUrl: congressUrl,
    href: congressUrl,
    keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints : [],
    proArgument: String(item.proArgument || item.yea_impact || item.yeaImpact || "").trim(),
    conArgument: String(item.conArgument || item.nay_impact || item.nayImpact || "").trim(),
  };
}

function normalizeAskAiContext(raw = {}) {
  const type = String(raw.type || "bill").toLowerCase() === "vote" ? "vote" : "bill";
  if (type === "vote") {
    return voteAskAiPayloadFromItem(raw, raw.politicianName || "");
  }
  return { type: "bill", ...billAskAiPayloadFromItem(raw) };
}

function ensureAskAiDrawer() {
  if (typeof document === "undefined") return null;
  const prefix = "feed-ask";
  let modal = document.getElementById(`${prefix}-modal`);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = `${prefix}-modal`;
  modal.className = "scorecard-match-detail ask-ai-drawer";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="scorecard-match-detail__backdrop" data-close-ask-ai="1"></div>
    <div
      class="scorecard-match-detail__panel scorecard-match-detail__panel--breakdown"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-ask-title"
    >
      <header class="scorecard-match-detail__header">
        <div>
          <p class="scorecard-match-detail__eyebrow">Ask AI</p>
          <p id="feed-ask-bill" class="scorecard-match-detail__bill"></p>
          <h2 id="feed-ask-title">Ask AI</h2>
        </div>
        <button
          type="button"
          class="scorecard-match-detail__close"
          data-close-ask-ai="1"
          aria-label="Close Ask AI"
        >✕</button>
      </header>
      <p id="feed-ask-summary" class="scorecard-match-detail__summary"></p>

      <section class="bill-ask-ai" aria-labelledby="feed-ask-ask-label">
        <h3 id="feed-ask-ask-label" class="bill-breakdown__label">
          Ask AI
        </h3>
        <div
          id="feed-ask-chips"
          class="bill-ask-ai__chips"
          role="group"
          aria-label="Suggested questions"
        ></div>
        <div id="feed-ask-ask-log" class="bill-ask-ai__log" aria-live="polite"></div>
        <form id="feed-ask-ask-form" class="bill-ask-ai__form">
          <label class="visually-hidden" for="feed-ask-ask-input"
            >Ask a specific question</label
          >
          <input
            id="feed-ask-ask-input"
            class="bill-ask-ai__input"
            type="text"
            maxlength="280"
            autocomplete="off"
            placeholder="Ask a specific question..."
          />
          <button type="submit" class="refresh-btn bill-ask-ai__submit">Ask</button>
        </form>
        <p id="feed-ask-ask-status" class="bill-ask-ai__status" hidden></p>
      </section>

      <footer class="scorecard-match-detail__footer">
        <button
          type="button"
          class="scorecard-match-detail__secondary"
          data-close-ask-ai="1"
        >Close</button>
      </footer>
    </div>
  `;
  document.body.append(modal);

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-ask-ai], [data-close-feed-ask]")) {
      closeAskAiDrawer();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeAskAiDrawer();
  });

  return modal;
}

function renderAskAiDrawerChips(modal, context) {
  const chipsEl = modal.querySelector("#feed-ask-chips");
  if (!chipsEl) return;
  const chips = askAiPresetChips(context);
  chipsEl.innerHTML = chips
    .map(
      (label) =>
        `<button type="button" class="bill-ask-ai__chip" data-ask-ai-chip>${String(
          label
        )
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</button>`
    )
    .join("");
  chipsEl.querySelectorAll("[data-ask-ai-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      askAiAboutBill("feed-ask", chip.textContent || "");
    });
  });
}

function closeAskAiDrawer() {
  const modal = document.getElementById("feed-ask-modal");
  if (!modal) return;
  if (modal._askAiAbort) {
    try {
      modal._askAiAbort.abort();
    } catch {
      /* ignore */
    }
    modal._askAiAbort = null;
  }
  modal.hidden = true;
  document.body.classList.remove("scorecard-match-detail-open");
  if (typeof modal._askAiOnClose === "function") {
    try {
      modal._askAiOnClose();
    } catch {
      /* ignore */
    }
  }
  modal._askAiOnClose = null;
}

/**
 * Open the reusable Ask AI drawer.
 * @param {{ isOpen?: boolean, onClose?: Function, context?: object }|object} options
 */
function openAskAiDrawer(options = {}) {
  const modal = ensureAskAiDrawer();
  if (!modal) return;
  if (options && options.isOpen === false) {
    closeAskAiDrawer();
    return;
  }

  const context = normalizeAskAiContext(options.context || options);
  modal._askAiOnClose =
    typeof options.onClose === "function" ? options.onClose : null;

  const billEl = document.getElementById("feed-ask-bill");
  const titleEl = document.getElementById("feed-ask-title");
  const summaryEl = document.getElementById("feed-ask-summary");
  const labelEl = document.getElementById("feed-ask-ask-label");
  const inputEl = document.getElementById("feed-ask-ask-input");

  const isVote = context.type === "vote";
  if (billEl) {
    billEl.textContent = isVote
      ? [context.politicianName, context.voteCast, context.billNumber]
          .filter(Boolean)
          .join(" · ")
      : context.number || "";
    billEl.hidden = !billEl.textContent;
  }
  if (titleEl) {
    titleEl.textContent = isVote
      ? `Ask AI about this vote`
      : context.title || "Ask AI about this bill";
  }
  if (summaryEl) {
    summaryEl.textContent = isVote
      ? context.billSummary ||
        context.takeaway ||
        `${context.politicianName || "This legislator"} voted ${
          context.voteCast || "—"
        } on ${context.billTitle || "this measure"}.`
      : context.takeaway ||
        context.cardSummary ||
        context.summary ||
        "Ask a question about this measure.";
  }
  if (labelEl) {
    labelEl.textContent = isVote
      ? "Ask AI about this vote"
      : "Ask AI about this bill";
  }
  if (inputEl) {
    inputEl.placeholder = isVote
      ? "Ask a specific question about this vote..."
      : "Ask a specific question about this bill...";
  }

  renderAskAiDrawerChips(modal, context);
  resetBillAskAi("feed-ask", context);
  bindBillAskAi("feed-ask");
  modal.hidden = false;
  document.body.classList.add("scorecard-match-detail-open");
  document.getElementById("feed-ask-ask-input")?.focus();
}

// Backward-compatible aliases for Feed / engagement callers.
function ensureStandaloneBillAskAiModal() {
  return ensureAskAiDrawer();
}

function closeBillAskAiModal() {
  closeAskAiDrawer();
}

function openBillAskAiModal(itemOrPayload = {}) {
  openAskAiDrawer({
    context: { type: "bill", ...itemOrPayload },
  });
}

function openVoteAskAiDrawer(voteOrPayload = {}, politicianName = "") {
  openAskAiDrawer({
    context: voteAskAiPayloadFromItem(voteOrPayload, politicianName),
  });
}

/**
 * Bind Tier 1 accordion toggles + Tier 3 deep-link buttons inside a match list.
 */
function bindActionMatchProgressiveDisclosure(root, openDetailFn) {
  if (!root) return;
  root.querySelectorAll("[data-toggle-match-accordion]").forEach((button, index) => {
    const item = button.closest(".scorecard-match-item");
    const panel = item?.querySelector(".scorecard-match-item__accordion");
    if (!panel) return;
    if (!panel.id) panel.id = `scorecard-match-accordion-${index}-${Date.now()}`;
    button.setAttribute("aria-controls", panel.id);
    button.addEventListener("click", () => {
      const open = panel.hasAttribute("hidden");
      // Close siblings for a clean accordion feel.
      root.querySelectorAll(".scorecard-match-item__accordion").forEach((other) => {
        if (other === panel) return;
        other.setAttribute("hidden", "");
        const otherBtn = other
          .closest(".scorecard-match-item")
          ?.querySelector("[data-toggle-match-accordion]");
        otherBtn?.setAttribute("aria-expanded", "false");
        other.closest(".scorecard-match-item")?.classList.remove("is-expanded");
      });
      if (open) {
        panel.removeAttribute("hidden");
        button.setAttribute("aria-expanded", "true");
        item?.classList.add("is-expanded");
      } else {
        panel.setAttribute("hidden", "");
        button.setAttribute("aria-expanded", "false");
        item?.classList.remove("is-expanded");
      }
    });
  });
  root.querySelectorAll("[data-open-match-detail]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const payload = JSON.parse(
          decodeURIComponent(button.getAttribute("data-open-match-detail") || "")
        );
        if (typeof openDetailFn === "function") openDetailFn(payload);
      } catch (error) {
        console.warn(error);
      }
    });
  });
}

/** Skeleton loading placeholders — match real card layout to avoid jump. */
function createSkeletonBone(extraClass = "") {
  const bone = document.createElement("span");
  bone.className = `skeleton-bone ${extraClass}`.trim();
  bone.setAttribute("aria-hidden", "true");
  return bone;
}

function createPoliticianCardSkeleton() {
  const card = document.createElement("article");
  card.className = "politician-card politician-card--skeleton skeleton-card";
  card.setAttribute("aria-hidden", "true");

  const media = document.createElement("div");
  media.className = "politician-card__media";
  media.append(createSkeletonBone("skeleton-bone--avatar"));

  const body = document.createElement("div");
  body.className = "politician-card__body";
  body.append(
    createSkeletonBone("skeleton-bone--title"),
    createSkeletonBone("skeleton-bone--line skeleton-bone--w60"),
    createSkeletonBone("skeleton-bone--chip")
  );

  const actions = document.createElement("div");
  actions.className = "politician-card__actions";
  actions.append(
    createSkeletonBone("skeleton-bone--btn"),
    createSkeletonBone("skeleton-bone--btn")
  );

  card.append(media, body, actions);
  return card;
}

function createPolicyBillCardSkeleton() {
  const card = document.createElement("article");
  card.className = "policy-bill-card policy-bill-card--skeleton skeleton-card";
  card.setAttribute("aria-hidden", "true");

  const header = document.createElement("div");
  header.className = "policy-bill-card__header";
  const headerMain = document.createElement("div");
  const badges = document.createElement("div");
  badges.className = "policy-bill-card__badges";
  badges.append(
    createSkeletonBone("skeleton-bone--chip"),
    createSkeletonBone("skeleton-bone--chip")
  );
  headerMain.append(
    badges,
    createSkeletonBone("skeleton-bone--title skeleton-bone--w90"),
    createSkeletonBone("skeleton-bone--line skeleton-bone--w40")
  );
  header.append(headerMain, createSkeletonBone("skeleton-bone--btn"));

  const summary = document.createElement("div");
  summary.className = "policy-bill-card__summary";
  summary.append(
    createSkeletonBone("skeleton-bone--line skeleton-bone--w25"),
    createSkeletonBone("skeleton-bone--line"),
    createSkeletonBone("skeleton-bone--line skeleton-bone--w85"),
    createSkeletonBone("skeleton-bone--line skeleton-bone--w70")
  );

  const progress = document.createElement("div");
  progress.className = "policy-bill-card__progress skeleton-progress";
  for (let i = 0; i < 4; i += 1) {
    const step = document.createElement("div");
    step.className = "policy-bill-card__step";
    step.append(
      createSkeletonBone("skeleton-bone--node"),
      createSkeletonBone("skeleton-bone--line skeleton-bone--w50")
    );
    progress.append(step);
  }

  card.append(
    header,
    summary,
    progress,
    createSkeletonBone("skeleton-bone--btn skeleton-bone--w30")
  );
  return card;
}

function createSearchResultCardSkeleton() {
  const card = document.createElement("article");
  card.className =
    "search-result-card search-result-card--skeleton skeleton-card";
  card.setAttribute("aria-hidden", "true");

  const badges = document.createElement("div");
  badges.className = "search-result-card__badges";
  badges.append(
    createSkeletonBone("skeleton-bone--chip"),
    createSkeletonBone("skeleton-bone--chip"),
    createSkeletonBone("skeleton-bone--chip")
  );

  card.append(
    badges,
    createSkeletonBone("skeleton-bone--title skeleton-bone--w85"),
    createSkeletonBone("skeleton-bone--line skeleton-bone--w45"),
    createSkeletonBone("skeleton-bone--line"),
    createSkeletonBone("skeleton-bone--line skeleton-bone--w75"),
    createSkeletonBone("skeleton-bone--btn skeleton-bone--w25")
  );
  return card;
}

function showSkeletonCards(container, { type = "bill", count = 4 } = {}) {
  if (!container) return;
  const factory =
    type === "politician"
      ? createPoliticianCardSkeleton
      : type === "search"
        ? createSearchResultCardSkeleton
        : createPolicyBillCardSkeleton;

  const wrap = document.createElement("div");
  wrap.className =
    type === "politician"
      ? "politician-grid politician-grid--flat skeleton-list"
      : "skeleton-list";
  wrap.setAttribute("aria-busy", "true");
  wrap.setAttribute(
    "aria-label",
    type === "politician"
      ? "Loading politicians"
      : type === "search"
        ? "Loading legislation results"
        : "Loading bills"
  );

  for (let i = 0; i < Math.max(1, count); i += 1) {
    wrap.append(factory());
  }

  container.replaceChildren(wrap);
}

/** Subtle app-wide toast confirmations for follow/note actions. */
let appToastTimer = null;

function ensureAppToastHost() {
  let host = document.getElementById("app-toast-host");
  if (host) return host;
  host = document.createElement("div");
  host.id = "app-toast-host";
  host.className = "app-toast-host";
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-atomic", "true");
  document.body.append(host);
  return host;
}

function showAppToast(message, type = "success", { duration = 2600 } = {}) {
  const text = String(message || "").trim();
  if (!text || typeof document === "undefined") return null;
  const host = ensureAppToastHost();
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${type}`;
  toast.setAttribute("role", "status");

  const icon = document.createElement("span");
  icon.className = "app-toast__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent =
    type === "error" ? "!" : type === "info" ? "i" : "✓";

  const body = document.createElement("span");
  body.className = "app-toast__text";
  body.textContent = text;

  toast.append(icon, body);
  host.replaceChildren(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  clearTimeout(appToastTimer);
  appToastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.classList.add("is-leaving");
    setTimeout(() => {
      if (toast.parentElement === host) toast.remove();
    }, 220);
  }, Math.max(1200, Number(duration) || 2600));

  return toast;
}

function setButtonLoading(button, isLoading, loadingLabel = "") {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.prevLabel) {
      button.dataset.prevLabel = button.textContent || "";
    }
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (loadingLabel) button.textContent = loadingLabel;
  } else {
    button.classList.remove("is-loading");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.prevLabel != null) {
      // Only restore if caller didn't already set a new label.
      if (loadingLabel && button.textContent === loadingLabel) {
        button.textContent = button.dataset.prevLabel;
      }
      delete button.dataset.prevLabel;
    }
  }
}

function flashSuccessBadge(button, label = "Saved") {
  if (!button) return;
  button.classList.add("is-success-flash");
  const badge = document.createElement("span");
  badge.className = "btn-success-badge";
  badge.textContent = label;
  button.append(badge);
  setTimeout(() => {
    badge.remove();
    button.classList.remove("is-success-flash");
  }, 1600);
}

