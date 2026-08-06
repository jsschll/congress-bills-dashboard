const {
  formatBillSummary,
  buildPrompt,
  heuristicFormat,
} = require("../format-bill-summary");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
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
      if (raw.length > 200_000) {
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    let rawSummary = "";
    let billTitle = "";
    let forceHeuristic = false;

    if (req.method === "GET") {
      rawSummary = String(req.query.rawSummary || req.query.summary || "");
      billTitle = String(req.query.billTitle || req.query.title || "");
      forceHeuristic =
        String(req.query.heuristic || "") === "1" ||
        String(req.query.heuristic || "").toLowerCase() === "true";
    } else if (req.method === "POST") {
      const body = await readBody(req);
      rawSummary = String(body.rawSummary || body.summary || "");
      billTitle = String(body.billTitle || body.title || "");
      forceHeuristic = Boolean(body.forceHeuristic || body.heuristic);
    } else {
      return json(res, 405, { error: "Method not allowed" });
    }

    if (!rawSummary.trim() && !billTitle.trim()) {
      return json(res, 400, {
        error: "Provide rawSummary and/or billTitle.",
      });
    }

    const card = await formatBillSummary(rawSummary, billTitle, {
      forceHeuristic,
    });
    const prompt = buildPrompt(rawSummary, billTitle);

    return json(res, 200, {
      ...card,
      billTitle: billTitle || null,
      prompt: {
        system: prompt.system,
        user: prompt.user,
      },
      fallbackExample: heuristicFormat(
        "This bill directs the Department of Transportation to update rail safety inspection rules and report compliance to Congress.",
        "Rail Safety Improvement Act"
      ),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error.message || "Could not format bill summary.",
    });
  }
};
