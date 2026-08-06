/**
 * Ask AI about a bill — streams a plain-English answer grounded in bill context.
 * Served at /api/chat-bill via api/format-bill-summary.js multiplex.
 */

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are an objective legislative analyst for Article 1. Answer user questions about this bill neutrally, concisely, and in plain English using the provided bill details. If the provided details do not contain enough information, say what is unknown instead of inventing facts. Do not give legal advice or tell the user how to vote.";

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function collapseWs(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBillContextBlock(bill = {}) {
  const keyPoints = Array.isArray(bill.keyPoints)
    ? bill.keyPoints
    : Array.isArray(bill.key_points)
      ? bill.key_points
      : [];
  const roll = bill.rollMeta || bill.roll_meta || {};
  const lines = [
    `Title: ${collapseWs(bill.title || bill.rawTitle || "Untitled measure")}`,
    `Bill / roll call: ${collapseWs(bill.number || bill.billNumber || "")}`,
    `Takeaway: ${collapseWs(bill.takeaway || "")}`,
    `Summary: ${collapseWs(
      bill.cardSummary || bill.summary || bill.plain_summary || ""
    )}`,
    keyPoints.length
      ? `Key points:\n- ${keyPoints
          .map((p) => collapseWs(p))
          .filter(Boolean)
          .slice(0, 5)
          .join("\n- ")}`
      : "",
    `Supporters argue: ${collapseWs(
      bill.proArgument || bill.yea || bill.pro_argument || ""
    )}`,
    `Opponents argue: ${collapseWs(
      bill.conArgument || bill.nay || bill.con_argument || ""
    )}`,
    `Roll call: ${[
      roll.result,
      roll.chamber,
      roll.rollCallNumber != null ? `Roll Call ${roll.rollCallNumber}` : "",
      roll.date,
      roll.yeaCount != null && roll.nayCount != null
        ? `Yea ${roll.yeaCount} · Nay ${roll.nayCount}`
        : "",
      bill.resultLabel || "",
    ]
      .map((part) => collapseWs(part))
      .filter(Boolean)
      .join(" · ")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function beginSse(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function streamTextAnswer(res, text, meta = {}) {
  beginSse(res);
  sendSse(res, "start", { provider: meta.provider || "fallback" });
  const answer = collapseWs(text);
  // Chunk so the UI streaming cursor still feels alive.
  const size = 48;
  for (let i = 0; i < answer.length; i += size) {
    sendSse(res, "token", { text: answer.slice(i, i + size) });
  }
  sendSse(res, "done", {});
  res.end();
}

function collectBillFacts(bill = {}) {
  const keyPoints = Array.isArray(bill.keyPoints)
    ? bill.keyPoints
    : Array.isArray(bill.key_points)
      ? bill.key_points
      : [];
  const bits = [
    bill.takeaway,
    bill.cardSummary || bill.summary || bill.plain_summary,
    ...keyPoints,
    bill.proArgument || bill.yea || bill.pro_argument,
    bill.conArgument || bill.nay || bill.con_argument,
  ]
    .map((part) => collapseWs(part))
    .filter(Boolean);
  return bits;
}

/**
 * Grounded non-LLM answer from the bill card when no API key is configured
 * on the serverless host (common if Anthropic is only in local .env).
 */
function answerFromBillContext(question, bill = {}) {
  const q = collapseWs(question).toLowerCase();
  const facts = collectBillFacts(bill);
  const hay = facts.join(" ").toLowerCase();
  const title = collapseWs(bill.title || bill.number || "This measure");

  const moneyHits = facts.filter((f) =>
    /\$|billion|million|appropriat|fund|budget|spending|tax|fee|revenue/i.test(f)
  );
  const peopleHits = facts.filter((f) =>
    /household|worker|family|student|immigrant|community|business|veteran|patient|voter|employer|resident|citizen|who|affect/i.test(
      f
    )
  );
  const timeHits = facts.filter((f) =>
    /deadline|timeline|fiscal year|fy\s*\d|by \d{4}|effective|implement|phase|year|month|date/i.test(
      f
    )
  );

  if (/fund|cost|pay for|budget|appropriat|dollar|spend/i.test(q)) {
    if (moneyHits.length) {
      return `${moneyHits.slice(0, 2).join(" ")} The bill card does not spell out a fuller financing plan beyond that.`;
    }
    return `The available summary for ${title} does not clearly say how the measure is funded. Check the official roll-call text or CRS summary for appropriation or revenue details.`;
  }

  if (/impact|affect|who|harm|benefit|community/i.test(q)) {
    if (peopleHits.length) {
      return `${peopleHits.slice(0, 2).join(" ")}`;
    }
    if (facts[0]) {
      return `${facts[0]} The card does not name a more specific group beyond that.`;
    }
    return `The available summary for ${title} does not clearly identify who is most impacted.`;
  }

  if (/timeline|when|deadline|implement|effective|schedule/i.test(q)) {
    if (timeHits.length) {
      return `${timeHits.slice(0, 2).join(" ")}`;
    }
    const roll = bill.rollMeta || {};
    if (roll.date) {
      return `This roll call is dated ${collapseWs(roll.date)}. The bill card does not include a detailed implementation timeline.`;
    }
    return `The available summary for ${title} does not include a clear implementation timeline.`;
  }

  if (facts.length) {
    return `${facts.slice(0, 2).join(" ")}${
      /unknown|not (clearly )?say|does not/i.test(hay)
        ? ""
        : " If you need a finer legal detail, open the official roll call linked on this card."
    }`;
  }

  return `There is not enough plain-English detail on this card yet to answer that about ${title}.`;
}

async function streamAnthropic({ question, contextBlock, res }) {
  const apiKey = env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  const model = env("ANTHROPIC_MODEL", "CLAUDE_MODEL") || ANTHROPIC_MODEL;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      temperature: 0.2,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Bill details:\n"""\n${contextBlock}\n"""\n\nVoter question: ${question}\n\nAnswer in 2–5 short sentences of plain English.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 240)}`);
  }

  beginSse(res);
  sendSse(res, "start", { provider: "anthropic" });

  const reader = response.body?.getReader?.();
  if (!reader) {
    // Rare non-stream body fallback
    const text = await response.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        const delta = parsed?.delta?.text || "";
        if (delta) sendSse(res, "token", { text: delta });
      } catch {
        /* ignore */
      }
    }
    sendSse(res, "done", {});
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() || "";
    for (const line of chunks) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (
        parsed?.type === "content_block_delta" &&
        parsed?.delta?.type === "text_delta" &&
        parsed?.delta?.text
      ) {
        sendSse(res, "token", { text: parsed.delta.text });
      }
      if (parsed?.type === "message_stop") {
        sendSse(res, "done", {});
      }
    }
  }
  sendSse(res, "done", {});
  res.end();
}

async function streamOpenAI({ question, contextBlock, res }) {
  const apiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const base = (
    env("OPENAI_BASE_URL", "LLM_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env("OPENAI_MODEL", "LLM_MODEL") || OPENAI_MODEL;

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Bill details:\n"""\n${contextBlock}\n"""\n\nVoter question: ${question}\n\nAnswer in 2–5 short sentences of plain English.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 240)}`);
  }

  beginSse(res);
  sendSse(res, "start", { provider: "openai" });

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error("OpenAI stream body unavailable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() || "";
    for (const line of chunks) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const delta = parsed?.choices?.[0]?.delta?.content || "";
      if (delta) sendSse(res, "token", { text: delta });
    }
  }
  sendSse(res, "done", {});
  res.end();
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = await readBody(req);
    const question = collapseWs(body.question || body.q || "");
    if (!question) {
      return json(res, 400, { error: "Provide a question." });
    }
    if (question.length > 400) {
      return json(res, 400, { error: "Question is too long (max 400 chars)." });
    }

    const bill = body.bill || body.context || body.payload || {};
    const contextBlock = buildBillContextBlock(bill);
    const hasSubstance = Boolean(
      collapseWs(
        bill.cardSummary ||
          bill.summary ||
          bill.plain_summary ||
          bill.takeaway ||
          bill.title ||
          bill.number ||
          ""
      )
    );
    if (!hasSubstance) {
      return json(res, 400, { error: "Provide bill context." });
    }

    if (env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY")) {
      await streamAnthropic({ question, contextBlock, res });
      return;
    }
    if (env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY")) {
      await streamOpenAI({ question, contextBlock, res });
      return;
    }

    // Production may not have LLM env vars even when local .env.local does.
    // Still answer from the bill card so Ask AI is usable, and log guidance.
    console.warn(
      "Ask AI: no ANTHROPIC_API_KEY/OPENAI_API_KEY on this host — using bill-card fallback. Add the key in Vercel → Project Settings → Environment Variables (Production)."
    );
    streamTextAnswer(res, answerFromBillContext(question, bill), {
      provider: "bill-card-fallback",
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      return json(res, 500, {
        error: error.message || "Could not answer that question.",
      });
    }
    try {
      sendSse(res, "error", {
        error: error.message || "Could not answer that question.",
      });
      res.end();
    } catch {
      /* ignore */
    }
  }
};
