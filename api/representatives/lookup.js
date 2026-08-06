const {
  getScorecardById,
  lookupRepresentativesByLocation,
  orderRepresentativesForTabs,
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
  const id =
    (url.searchParams.get("id") || url.searchParams.get("representativeId") || "")
      .trim() || null;
  const bioguideId =
    (url.searchParams.get("bioguideId") ||
      url.searchParams.get("bioguide") ||
      "").trim() || null;
  const politicianId =
    (url.searchParams.get("politicianId") ||
      url.searchParams.get("rosterId") ||
      "").trim() || null;
  return { zipCode, address, id, bioguideId, politicianId };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const { zipCode, address, id, bioguideId, politicianId } = readQuery(req);

  try {
    // If location is also present, return the full district set with active id
    // only when the requested member is actually in that district. Never fall
    // back to a lone out-of-district deep link when the user asked by ZIP/address
    // with a stale session id (that resurfaced Josh Hawley as "my reps").
    if (id || bioguideId || politicianId) {
      if (zipCode || address) {
        const payload = await lookupRepresentativesByLocation({
          zipCode,
          address,
        });
        const ordered = orderRepresentativesForTabs(
          payload.representatives || []
        );
        const active =
          ordered.find((rep) => rep.profile.id === id) ||
          ordered.find(
            (rep) =>
              bioguideId &&
              String(rep.profile.bioguideId || "").toUpperCase() ===
                bioguideId.toUpperCase()
          ) ||
          ordered.find(
            (rep) =>
              politicianId &&
              String(rep.profile.rosterPoliticianId || "") === politicianId
          ) ||
          null;
        if (active) {
          return json(res, 200, {
            ...payload,
            representatives: ordered,
            activeId: active.profile.id,
            representative: active,
          });
        }
        // Location lookup wins: return the district set even if the stale id
        // / bioguide is not in it (caller can deep-link without location).
        if (ordered.length) {
          return json(res, 200, {
            ...payload,
            representatives: ordered,
            activeId: ordered[0]?.profile?.id || null,
            representative: ordered[0] || null,
          });
        }
      }

      const single = await getScorecardById({
        id,
        bioguideId,
        politicianId,
        voteLimit: 25,
      });
      return json(res, 200, {
        ...single,
        activeId: single.representative?.profile?.id || null,
      });
    }

    const payload = await lookupRepresentativesByLocation({ zipCode, address });
    const ordered = orderRepresentativesForTabs(payload.representatives || []);
    return json(res, 200, {
      ...payload,
      representatives: ordered,
      activeId: ordered[0]?.profile?.id || null,
      representative: ordered[0] || null,
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const message = error?.message || "Representative lookup failed";
    console.error("[representatives/lookup]", message, error?.cause || "");
    return json(res, status, {
      ok: false,
      error: message,
      query: { zipCode, address, id, bioguideId, politicianId },
    });
  }
};
