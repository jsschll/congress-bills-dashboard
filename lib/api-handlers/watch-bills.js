const {
  env,
  isFloorVoteAction,
  supabaseRest,
  insertNotification,
  parseStateFromAddress,
  parseCityFromAddress,
} = require("../notify");

const CONGRESS = 119;
const API_BASE = "https://api.congress.gov/v3";
const PAGE_SIZE = 50;

const NEIGHBORHOOD_SAMPLES = [
  {
    id: "city-nyc-intro-1479-2024",
    bill_number: "Int 1479-2024",
    title: "Requires disclosure of large residential building energy use",
    state: "NY",
    city: "New York",
    action_text: "City proposal introduced for large-building energy disclosures.",
  },
  {
    id: "city-chi-o2024-0001234",
    bill_number: "O2024-0001234",
    title: "Updates sidewalk cafe permitting and outdoor dining rules",
    state: "IL",
    city: "Chicago",
    action_text: "Ordinance update for outdoor dining permits.",
  },
  {
    id: "city-sd-o-2026-42",
    bill_number: "O-2026-42",
    title: "Expands tenant relocation assistance for no-fault evictions",
    state: "CA",
    city: "San Diego",
    action_text: "City ordinance proposed for tenant relocation assistance.",
  },
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function fingerprint(parts) {
  return parts
    .map((part) => String(part || ""))
    .join("|")
    .toLowerCase();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Congress API ${response.status} for ${url}`);
  }
  return response.json();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSentences(text, max = 2) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 15);
  if (!sentences.length) return text.slice(0, 280);
  return sentences.slice(0, max).join(" ");
}

async function fetchSummaryExcerpt(bill, apiKey) {
  try {
    const url = `${API_BASE}/bill/${bill.congress}/${String(bill.type).toLowerCase()}/${bill.number}/summaries?format=json&api_key=${apiKey}`;
    const data = await fetchJson(url);
    const summaries = data.summaries || [];
    if (!summaries.length) return null;
    const latest = summaries[summaries.length - 1];
    const plain = stripHtml(latest.text || "");
    return plain ? truncateSentences(plain, 2) : null;
  } catch {
    return null;
  }
}

async function fetchPolicyArea(bill, apiKey) {
  try {
    const url = `${API_BASE}/bill/${bill.congress}/${String(bill.type).toLowerCase()}/${bill.number}/subjects?format=json&api_key=${apiKey}`;
    const data = await fetchJson(url);
    return (
      data?.subjects?.legislativeSubjects?.[0]?.name ||
      data?.subjects?.policyArea?.name ||
      data?.policyArea?.name ||
      null
    );
  } catch {
    return null;
  }
}

function matchesFollow(bill, policyArea, follow) {
  const value = follow.value.toLowerCase();
  const title = (bill.title || "").toLowerCase();
  const action = (bill.latestAction?.text || "").toLowerCase();
  const area = (policyArea || "").toLowerCase();

  if (follow.kind === "keyword") {
    return title.includes(value) || action.includes(value);
  }

  if (follow.kind === "policy_area") {
    return area === value || area.includes(value) || title.includes(value);
  }

  return false;
}

function cityMatches(left, right) {
  const a = String(left || "")
    .toLowerCase()
    .replace(/\bcity of\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const b = String(right || "")
    .toLowerCase()
    .replace(/\bcity of\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function parseBillId(billId) {
  // federal-119-hr-1234
  const match = String(billId || "").match(/^federal-(\d+)-([a-z]+)-(\d+)$/i);
  if (!match) return null;
  return {
    congress: Number(match[1]),
    type: match[2].toUpperCase(),
    number: match[3],
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const congressKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!congressKey || !env("SUPABASE_URL") || !env("SUPABASE_SERVICE_ROLE_KEY")) {
    return json(res, 500, {
      error:
        "Missing CONGRESS_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  try {
    const [follows, profiles, followedBills] = await Promise.all([
      supabaseRest("followed_topics?select=*"),
      supabaseRest(
        "profiles?select=id,email,home_address,notify_critical,notify_digest,notify_neighborhood"
      ),
      supabaseRest("followed_bills?select=user_id,bill_id"),
    ]);

    const profileById = new Map((profiles || []).map((row) => [row.id, row]));
    const listUrl = `${API_BASE}/bill/${CONGRESS}?limit=${PAGE_SIZE}&sort=updateDate+desc&format=json&api_key=${congressKey}`;
    const listData = await fetchJson(listUrl);
    const bills = listData.bills || [];

    let inserted = 0;
    let criticalInserted = 0;
    let neighborhoodInserted = 0;
    const policyCache = new Map();
    const summaryCache = new Map();

    // 1) Topic follows → in-app topic notifications (digests summarize later)
    for (const bill of bills) {
      const billKey = `${bill.congress}-${bill.type}-${bill.number}`;
      let policyArea = policyCache.get(billKey);
      if (policyArea === undefined) {
        policyArea = await fetchPolicyArea(bill, congressKey);
        policyCache.set(billKey, policyArea);
      }

      const matchingFollows = (follows || []).filter((follow) =>
        matchesFollow(bill, policyArea, follow)
      );
      if (!matchingFollows.length) continue;

      let excerpt = summaryCache.get(billKey);
      if (excerpt === undefined) {
        excerpt = await fetchSummaryExcerpt(bill, congressKey);
        summaryCache.set(billKey, excerpt);
      }

      const actionDate = bill.latestAction?.actionDate || bill.updateDate || "";
      const actionText = bill.latestAction?.text || "Bill updated";

      for (const follow of matchingFollows) {
        const profile = profileById.get(follow.user_id);
        // Users with digest=off still get topic alerts in-app.
        // Digest preference only controls email consolidation cadence.
        const updateFingerprint = fingerprint([
          bill.congress,
          bill.type,
          bill.number,
          actionDate,
          actionText,
          follow.value,
          "topic",
        ]);

        const ok = await insertNotification({
          user_id: follow.user_id,
          bill_congress: bill.congress,
          bill_type: bill.type,
          bill_number: String(bill.number),
          bill_title: bill.title || "Untitled bill",
          matched_topic: follow.value,
          matched_kind: follow.kind,
          category: "topic",
          action_text: actionText,
          action_date: actionDate,
          summary_excerpt: excerpt,
          update_fingerprint: updateFingerprint,
        });
        if (ok) inserted += 1;

        // Critical path for topic-matched floor votes when enabled
        if (
          profile?.notify_critical !== false &&
          isFloorVoteAction(actionText)
        ) {
          const criticalFp = fingerprint([
            bill.congress,
            bill.type,
            bill.number,
            actionDate,
            actionText,
            "critical",
          ]);
          const criticalOk = await insertNotification({
            user_id: follow.user_id,
            bill_congress: bill.congress,
            bill_type: bill.type,
            bill_number: String(bill.number),
            bill_title: bill.title || "Untitled bill",
            matched_topic: "Critical floor action",
            matched_kind: "critical",
            category: "critical",
            action_text: actionText,
            action_date: actionDate,
            summary_excerpt: excerpt,
            update_fingerprint: criticalFp,
          });
          if (criticalOk) criticalInserted += 1;
        }
      }
    }

    // 2) Followed bills → critical alerts on floor votes
    const billByKey = new Map(
      bills.map((bill) => [
        `federal-${bill.congress}-${String(bill.type).toLowerCase()}-${bill.number}`.toLowerCase(),
        bill,
      ])
    );

    for (const follow of followedBills || []) {
      const profile = profileById.get(follow.user_id);
      if (profile?.notify_critical === false) continue;

      const parsed = parseBillId(follow.bill_id);
      let bill = billByKey.get(String(follow.bill_id || "").toLowerCase());

      if (!bill && parsed) {
        try {
          const detail = await fetchJson(
            `${API_BASE}/bill/${parsed.congress}/${parsed.type.toLowerCase()}/${parsed.number}?format=json&api_key=${congressKey}`
          );
          bill = detail.bill || null;
        } catch {
          bill = null;
        }
      }
      if (!bill) continue;

      const actionText = bill.latestAction?.text || "";
      if (!isFloorVoteAction(actionText)) continue;
      const actionDate = bill.latestAction?.actionDate || bill.updateDate || "";
      const criticalFp = fingerprint([
        bill.congress || parsed?.congress,
        bill.type || parsed?.type,
        bill.number || parsed?.number,
        actionDate,
        actionText,
        "critical-followed",
      ]);
      const ok = await insertNotification({
        user_id: follow.user_id,
        bill_congress: Number(bill.congress || parsed.congress || CONGRESS),
        bill_type: String(bill.type || parsed.type || "HR"),
        bill_number: String(bill.number || parsed.number || ""),
        bill_title: bill.title || "Untitled bill",
        matched_topic: "Followed bill · critical action",
        matched_kind: "critical",
        category: "critical",
        action_text: actionText,
        action_date: actionDate,
        summary_excerpt: null,
        update_fingerprint: criticalFp,
      });
      if (ok) criticalInserted += 1;
    }

    // 3) Neighborhood alerts from curated municipal samples near saved address
    for (const profile of profiles || []) {
      if (!profile.notify_neighborhood) continue;
      const address = profile.home_address || "";
      if (!address) continue;
      const state = parseStateFromAddress(address);
      const city = parseCityFromAddress(address);
      if (!state && !city) continue;

      for (const sample of NEIGHBORHOOD_SAMPLES) {
        if (state && sample.state !== state) continue;
        if (city && !cityMatches(city, sample.city)) continue;
        const fp = fingerprint([
          profile.id,
          sample.id,
          sample.bill_number,
          "neighborhood",
        ]);
        const ok = await insertNotification({
          user_id: profile.id,
          bill_congress: 0,
          bill_type: "LOCAL",
          bill_number: sample.bill_number,
          bill_title: sample.title,
          matched_topic: `Neighborhood · ${sample.city}`,
          matched_kind: "neighborhood",
          category: "neighborhood",
          action_text: sample.action_text,
          action_date: new Date().toISOString().slice(0, 10),
          summary_excerpt: sample.action_text,
          update_fingerprint: fp,
        });
        if (ok) neighborhoodInserted += 1;
      }
    }

    return json(res, 200, {
      ok: true,
      scanned: bills.length,
      follows: (follows || []).length,
      inserted,
      criticalInserted,
      neighborhoodInserted,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Watcher failed" });
  }
};
