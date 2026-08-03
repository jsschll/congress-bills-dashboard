/**
 * Daily cron: ingest recently updated Congress.gov bills into processed_votes.
 *
 * GET|POST /api/cron-sync-bills
 * Auth (when CRON_SECRET or SYNC_BILLS_SECRET is set):
 *   Authorization: Bearer <secret>
 *
 * Query/body: limit (default 40), congress (default 119), force=1
 *
 * Note: this project uses Vercel Serverless `api/*.js` (not Next.js App Router).
 * maxDuration is configured in vercel.json (60s).
 */
const { syncRecentBills, DEFAULT_CONGRESS } = require("../lib/sync-bills");

const maxDuration = 60;
module.exports.maxDuration = maxDuration;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.end(JSON.stringify(body));
}

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    if (typeof req.body === "string" && req.body.trim()) {
      try {
        resolve(JSON.parse(req.body));
      } catch (error) {
        reject(error);
      }
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 50_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function assertAuthorized(req) {
  const secret = env("CRON_SECRET", "SYNC_BILLS_SECRET");
  if (!secret) return;
  const header = String(req.headers.authorization || "");
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const queryToken = String(req.query?.secret || "").trim();
  if (token !== secret && queryToken !== secret) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    assertAuthorized(req);
    const body = req.method === "POST" ? await readBody(req) : {};
    const limit = Math.min(
      250,
      Math.max(1, Number(req.query?.limit || body.limit || 40) || 40)
    );
    const congress =
      Number(req.query?.congress || body.congress || DEFAULT_CONGRESS) ||
      DEFAULT_CONGRESS;
    const forceRaw = req.query?.force ?? body.force;
    const force =
      forceRaw === true ||
      String(forceRaw || "").toLowerCase() === "1" ||
      String(forceRaw || "").toLowerCase() === "true";

    // Keep cron under maxDuration: small delay, capped limit.
    const result = await syncRecentBills({
      congress,
      limit,
      delayMs: 1000,
      force,
      log: true,
    });

    return json(res, 200, {
      ok: true,
      maxDuration,
      ...result,
    });
  } catch (error) {
    console.error("cron-sync-bills failed:", error);
    return json(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Could not sync bills.",
    });
  }
};
