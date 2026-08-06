/**
 * Hobby-plan consolidation: one serverless function for AI helpers.
 * Public URLs via vercel.json rewrites:
 *   /api/format-bill-summary → ?route=format-bill-summary (default)
 *   /api/chat-bill           → ?route=chat-bill
 */
const formatBillSummary = require("../lib/api-handlers/format-bill-summary");
const chatBill = require("../lib/api-handlers/chat-bill");

const ROUTES = {
  "format-bill-summary": formatBillSummary,
  "chat-bill": chatBill,
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
  // Direct hits on this entry file default to the legacy summary formatter.
  return "format-bill-summary";
}

module.exports = async function handler(req, res) {
  const route = resolveRoute(req);
  const next = ROUTES[route];
  if (!next) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Unknown AI route.",
        routes: Object.keys(ROUTES),
      })
    );
    return;
  }
  return next(req, res);
};
