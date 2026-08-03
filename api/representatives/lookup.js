const {
  lookupRepresentativesByLocation,
} = require("../../lib/services/scorecardService");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function readQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const zipCode =
    (url.searchParams.get("zipCode") ||
      url.searchParams.get("zip") ||
      url.searchParams.get("postal_code") ||
      "").trim() || null;
  const address =
    (url.searchParams.get("address") ||
      url.searchParams.get("q") ||
      "").trim() || null;
  return { zipCode, address };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const { zipCode, address } = readQuery(req);

  try {
    const payload = await lookupRepresentativesByLocation({ zipCode, address });
    return json(res, 200, payload);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const message = error?.message || "Representative lookup failed";
    console.error("[representatives/lookup]", message, error?.cause || "");
    return json(res, status, {
      ok: false,
      error: message,
      query: { zipCode, address },
    });
  }
};
