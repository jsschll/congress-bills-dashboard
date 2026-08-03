/**
 * Votes feed — reads plain-English cards from Supabase `processed_votes`.
 * Populated offline by /api/sync-votes (Claude/OpenAI).
 */
const { createClient } = require("@supabase/supabase-js");
const {
  mapProcessedVoteToFeedItem,
  PROCESSED_VOTES_SELECT,
} = require("../lib/processed-votes-feed");

const DEFAULT_LIMIT = 48;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function getSupabase() {
  const url = env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const key =
    env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_ANON_KEY") ||
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function subjectMatches(vote, subjectQuery) {
  const subject = String(subjectQuery || "").trim().toLowerCase();
  if (!subject) return true;
  const aliases = {
    healthcare: ["healthcare", "health", "medicare", "medicaid"],
    defense: ["defense", "armed", "national security", "foreign", "military"],
    economy: ["economy", "tax", "budget", "appropriations", "finance", "commerce"],
    tech: ["tech", "technology", "science", "communications", "space"],
    energy: ["energy"],
    "civil rights": ["civil rights", "civil liberties"],
    civil_rights: ["civil rights", "civil liberties"],
    immigration: ["immigration", "border"],
    justice: ["justice", "crime"],
    family: ["family", "education", "housing"],
    environment: ["environment", "agriculture", "public lands"],
  };
  const needles = aliases[subject] || [subject.replace(/_/g, " ")];
  const haystack = [
    vote.subjectCategory,
    vote.policyArea,
    vote.title,
    vote.summary,
    vote.officialSummary,
    vote.voteQuestion,
    vote.billNumber,
  ]
    .join(" ")
    .toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const limit = Math.min(
    40,
    Math.max(5, Number(req.query.limit) || DEFAULT_LIMIT)
  );
  const subject = String(req.query.subject || "").trim().toLowerCase();
  const kindFilter = String(req.query.kind || "").trim().toLowerCase();

  try {
    const supabase = getSupabase();
    // Fetch a wider window so subject/kind filters still return enough rows.
    const fetchLimit = Math.min(100, Math.max(limit * 4, limit));
    const { data, error } = await supabase
      .from("processed_votes")
      .select(PROCESSED_VOTES_SELECT)
      .order("vote_date", { ascending: false, nullsFirst: false })
      .limit(fetchLimit);

    if (error) {
      throw new Error(error.message || "Could not load processed_votes.");
    }

    let items = (data || []).map(mapProcessedVoteToFeedItem);

    if (kindFilter === "final_passage" || kindFilter === "amendment") {
      const filtered = items.filter((vote) => vote.voteKind === kindFilter);
      if (filtered.length) items = filtered;
    }

    if (subject) {
      items = items.filter((vote) => subjectMatches(vote, subject));
    }

    items = items.slice(0, limit);

    return json(res, 200, {
      source: "processed_votes",
      count: items.length,
      items,
      subjects: [
        "Healthcare",
        "Defense",
        "Economy",
        "Tech",
        "Energy",
        "Civil rights",
        "Immigration",
      ],
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Votes feed failed" });
  }
};
