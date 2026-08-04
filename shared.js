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

  const summary =
    clampPunchySummary(
      item.plain_summary ||
        item.plainSummary ||
        item.plainEnglishSummary ||
        item.what_it_does ||
        item.whatItDoes ||
        item.officialSummary ||
        item.shortPitch ||
        item.summary ||
        item.title ||
        item.voteQuestion ||
        "",
      { maxSentences: 2, maxWords: 30 }
    ) || "No plain-English summary is available for this vote yet.";

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
  const summary = String(row.summary || "").trim();
  if (!summary) return item;
  item.shortPitch = summary;
  item.summary = summary;
  item.officialSummary = summary;
  item.summarySource = String(row.summary_source || "processed_votes");
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

function collapseMatchWs(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatchSentence(text, maxChars = 220) {
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
  if (sentence.length > maxChars) {
    sentence = `${sentence.slice(0, maxChars - 1).replace(/\s+\S*$/, "")}…`;
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

/** Enforce ≤2 sentences / ~30 words for Action Match card summaries. */
function clampPunchySummary(text = "", { maxSentences = 2, maxWords = 30 } = {}) {
  const sentences = splitMatchSentences(text).slice(0, maxSentences);
  if (!sentences.length) return "";
  let out = sentences.join(" ");
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    out = words.slice(0, maxWords).join(" ").replace(/[,:;–—-]+$/, "");
    if (!/[.!?]$/.test(out)) out = `${out}.`;
  } else if (!/[.!?]$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}

/**
 * Turn a raw yea/nay impact into a one-line clause (≤14 words).
 * Strips "Votes to…", "A Yea vote means…", etc.
 */
function punchyImpactClause(text = "", { maxWords = 14 } = {}) {
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
  if (words.length > maxWords) words = words.slice(0, maxWords);
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
 * Prefer Claude fields on the enriched vote (`short_title`, `plain_summary`).
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
  // vote.plain_summary is the primary card-body explanation.
  const plainSummary =
    clampPunchySummary(
      voteCopy?.plain_summary ||
        voteCopy?.plainSummary ||
        row.plain_summary ||
        row.plainSummary ||
        impact.plain_summary ||
        impact.what_it_does ||
        row.detailSummary ||
        voteCopy?.summary ||
        bill.short_pitch ||
        bill.shortPitch ||
        "",
      { maxSentences: 2, maxWords: 30 }
    ) || "No plain-English summary is available for this roll call yet.";
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
  return {
    bill,
    voteCopy,
    impact,
    shortTitle,
    rawCode,
    showCode:
      Boolean(rawCode) &&
      rawCode.toLowerCase() !== String(shortTitle).toLowerCase(),
    plainSummary,
    detailHref,
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

/**
 * Render one Where You Agree / Differ list item using Claude vote fields.
 * @param {object} row
 * @param {(value: unknown) => string} escapeHtmlFn
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
      summary: copy.plainSummary,
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
    })
  );
  const yourBadgeClass = `scorecard-match-badge scorecard-match-badge--${
    copy.yourStanceTone || "neutral"
  }`;
  const repBadgeClass = `scorecard-match-badge scorecard-match-badge--${
    copy.repStanceTone || "neutral"
  }`;

  return `<li class="scorecard-match-item">
      <div class="scorecard-match-item__top">
        <button
          type="button"
          class="scorecard-match-item__title"
          data-open-match-detail="${detailPayload}"
        >
          <span class="scorecard-match-item__name">${esc(
            copy.shortTitle
          )}</span>
          ${
            copy.showCode
              ? `<span class="scorecard-match-item__code">${esc(
                  copy.rawCode
                )}</span>`
              : ""
          }
        </button>
        <button
          type="button"
          class="scorecard-match-item__info"
          data-open-match-detail="${detailPayload}"
          aria-label="Open roll-call detail"
          title="Open roll-call detail"
        >ⓘ</button>
      </div>
      <p class="scorecard-match-item__summary">${esc(copy.plainSummary)}</p>
      <ul class="scorecard-match-item__breakdown" aria-label="Stance comparison">
        <li class="scorecard-match-item__stance-row">
          <span class="scorecard-match-item__stance-meta">
            <span class="scorecard-match-item__stance-label">Your Stance</span>
            <span class="${yourBadgeClass}">${esc(copy.yourStanceLabel)}</span>
          </span>
          <span class="scorecard-match-item__stance-line">${esc(
            copy.yourStanceImpact
          )}</span>
        </li>
        <li class="scorecard-match-item__stance-row">
          <span class="scorecard-match-item__stance-meta">
            <span class="scorecard-match-item__stance-label">Rep Stance</span>
            <span class="${repBadgeClass}">${esc(copy.repStanceLabel)}</span>
          </span>
          <span class="scorecard-match-item__stance-line">${esc(
            copy.repStanceImpact
          )}</span>
        </li>
      </ul>
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
      voteCopy?.plain_summary ||
        voteCopy?.plainSummary ||
        voteCopy?.what_it_does ||
        voteCopy?.whatItDoes ||
        voteCopy?.summary ||
        bill.short_pitch ||
        bill.shortPitch ||
        "",
      { maxSentences: 2, maxWords: 30 }
    ) || "No plain-English summary is available for this roll call yet.";
  const what_it_does = plain_summary;
  const yea_impact =
    punchyImpactClause(voteCopy?.yea_impact || voteCopy?.yeaImpact || "") ||
    punchyImpactClause(means.yea) ||
    "Advancing this measure as written";
  const nay_impact =
    punchyImpactClause(voteCopy?.nay_impact || voteCopy?.nayImpact || "") ||
    punchyImpactClause(means.nay) ||
    "Rejecting this measure";

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
      "roll_call_id, title, summary, yea_means, nay_means, short_title, plain_summary, what_it_does, yea_impact, nay_impact, bill_number, official_url, vote_kind, vote_question"
    )
    .in("roll_call_id", ids));
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

