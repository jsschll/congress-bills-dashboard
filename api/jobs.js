/**
 * Hobby-plan consolidation: one serverless function for scheduled jobs.
 * Public URLs are preserved via vercel.json rewrites:
 *   /api/watch-bills            → ?route=watch-bills
 *   /api/deliver-notifications  → ?route=deliver-notifications
 */
const watchBills = require("../lib/api-handlers/watch-bills");
const deliverNotifications = require("../lib/api-handlers/deliver-notifications");

const ROUTES = {
  "watch-bills": watchBills,
  "deliver-notifications": deliverNotifications,
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
        error: "Unknown jobs route.",
        routes: Object.keys(ROUTES),
      })
    );
    return;
  }
  return next(req, res);
};
