/**
 * Hobby-plan consolidation: one serverless function for vote endpoints.
 * Public URLs are preserved via vercel.json rewrites:
 *   /api/votes-feed       → ?route=votes-feed
 *   /api/sync-votes       → ?route=sync-votes
 *   /api/bill-vote-match → ?route=bill-vote-match
 */
const votesFeed = require("../lib/api-handlers/votes-feed");
const syncVotes = require("../lib/api-handlers/sync-votes");
const billVoteMatch = require("../lib/api-handlers/bill-vote-match");

const ROUTES = {
  "votes-feed": votesFeed,
  "sync-votes": syncVotes,
  "bill-vote-match": billVoteMatch,
};

function resolveRoute(req) {
  const fromQuery = String(req.query?.route || "").trim().toLowerCase();
  if (ROUTES[fromQuery]) return fromQuery;

  const url = String(req.url || "");
  const pathOnly = url.split("?")[0];
  for (const name of Object.keys(ROUTES)) {
    if (pathOnly.endsWith(`/api/${name}`) || pathOnly.endsWith(`/${name}`)) {
      return name;
    }
  }
  return "";
}

module.exports = async function handler(req, res) {
  const route = resolveRoute(req);
  const next = ROUTES[route];
  if (!next) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Unknown votes route.",
        routes: Object.keys(ROUTES),
      })
    );
    return;
  }
  return next(req, res);
};
