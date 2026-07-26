const CONGRESS = 119;
const API_BASE = "https://api.congress.gov/v3";
const PAGE_SIZE = 50;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function fingerprint(bill, actionDate, actionText, matchedTopic) {
  return [
    bill.congress,
    bill.type,
    bill.number,
    actionDate || "",
    actionText || "",
    matchedTopic || "",
  ]
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const congressKey = process.env.CONGRESS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!congressKey || !supabaseUrl || !serviceKey) {
    return json(res, 500, {
      error:
        "Missing CONGRESS_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  try {
    const followsRes = await fetch(
      `${supabaseUrl}/rest/v1/followed_topics?select=*`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    if (!followsRes.ok) {
      throw new Error(`Supabase follows ${followsRes.status}`);
    }
    const follows = await followsRes.json();
    if (!follows.length) {
      return json(res, 200, { ok: true, inserted: 0, message: "No follows" });
    }

    const listUrl = `${API_BASE}/bill/${CONGRESS}?limit=${PAGE_SIZE}&sort=updateDate+desc&format=json&api_key=${congressKey}`;
    const listData = await fetchJson(listUrl);
    const bills = listData.bills || [];

    let inserted = 0;
    const policyCache = new Map();
    const summaryCache = new Map();

    for (const bill of bills) {
      const billKey = `${bill.congress}-${bill.type}-${bill.number}`;
      let policyArea = policyCache.get(billKey);
      if (policyArea === undefined) {
        policyArea = await fetchPolicyArea(bill, congressKey);
        policyCache.set(billKey, policyArea);
      }

      const matchingFollows = follows.filter((follow) =>
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
        const updateFingerprint = fingerprint(
          bill,
          actionDate,
          actionText,
          follow.value
        );

        const row = {
          user_id: follow.user_id,
          bill_congress: bill.congress,
          bill_type: bill.type,
          bill_number: String(bill.number),
          bill_title: bill.title || "Untitled bill",
          matched_topic: follow.value,
          matched_kind: follow.kind,
          action_text: actionText,
          action_date: actionDate,
          summary_excerpt: excerpt,
          update_fingerprint: updateFingerprint,
        };

        const insertRes = await fetch(
          `${supabaseUrl}/rest/v1/notifications?on_conflict=user_id,update_fingerprint`,
          {
            method: "POST",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=ignore-duplicates,return=minimal",
            },
            body: JSON.stringify(row),
          }
        );

        if (insertRes.ok || insertRes.status === 201) {
          inserted += 1;
        } else if (insertRes.status !== 409) {
          const text = await insertRes.text();
          console.error("Insert failed", insertRes.status, text);
        }
      }
    }

    return json(res, 200, {
      ok: true,
      scanned: bills.length,
      follows: follows.length,
      inserted,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Watcher failed" });
  }
};
