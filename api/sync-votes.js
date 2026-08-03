/**
 * Vercel serverless entry for vote sync.
 * GET or POST /api/sync-votes
 *
 * Optional query/body:
 *   limit, congress, skipExisting=0 to force re-format
 * Optional auth:
 *   Authorization: Bearer $CRON_SECRET  (or SYNC_VOTES_SECRET)
 */
const { syncVotes, DEFAULT_LIMIT } = require("../lib/sync-votes");

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
  const secret = env("CRON_SECRET", "SYNC_VOTES_SECRET");
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
    const limit = Number(req.query?.limit || body.limit || DEFAULT_LIMIT);
    const congress = Number(req.query?.congress || body.congress || 0) || undefined;
    const chamber = String(
      req.query?.chamber || body.chamber || "both"
    ).toLowerCase();
    const skipExistingRaw = req.query?.skipExisting ?? body.skipExisting;
    const skipExisting =
      skipExistingRaw === undefined
        ? true
        : !(
            String(skipExistingRaw).toLowerCase() === "0" ||
            String(skipExistingRaw).toLowerCase() === "false"
          );

    const result = await syncVotes({ limit, congress, chamber, skipExisting });
    return json(res, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("sync-votes failed:", error);
    return json(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Could not sync votes.",
    });
  }
};
