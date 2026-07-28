function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function siteBaseUrl() {
  return (
    env("SITE_URL", "NEXT_PUBLIC_SITE_URL") ||
    "https://congress-bills-dashboard.vercel.app"
  ).replace(/\/$/, "");
}

function isFloorVoteAction(text = "") {
  const value = String(text || "").toLowerCase();
  return (
    value.includes("passed senate") ||
    value.includes("passed/agreed to in senate") ||
    value.includes("passed house") ||
    value.includes("passed/agreed to in house") ||
    value.includes("agreed to in senate") ||
    value.includes("agreed to in house") ||
    value.includes("became public law") ||
    value.includes("signed by president") ||
    value.includes("vetoed") ||
    (/\bfloor\b/.test(value) && /\b(vote|consideration|passed)\b/.test(value))
  );
}

async function supabaseRest(path, { method = "GET", body, prefer } = {}) {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (data && data.message) ||
      (typeof data === "string" ? data : text) ||
      `Supabase ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function insertNotification(row) {
  const payload = {
    category: "topic",
    ...row,
  };
  try {
    await supabaseRest("notifications?on_conflict=user_id,update_fingerprint", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: payload,
    });
    return true;
  } catch (error) {
    if (error.status === 409) return false;
    throw error;
  }
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("NOTIFY_FROM_EMAIL", "EMAIL_FROM") || "Congress Bills <onboarding@resend.dev>";
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not configured" };
  }
  if (!to) {
    return { ok: false, skipped: true, reason: "Missing recipient" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      reason: data.message || `Resend ${response.status}`,
    };
  }
  return { ok: true, id: data.id };
}

function notificationEmailHtml(item, { heading } = {}) {
  const billLabel = `${item.bill_type || ""} ${item.bill_number || ""}`.trim();
  const feedUrl = `${siteBaseUrl()}/bills-policies.html?tab=updates`;
  return `
    <div style="font-family: Georgia, serif; line-height: 1.5; color: #111;">
      <h1 style="font-size: 20px;">${heading || "Congress Bills update"}</h1>
      <p style="margin: 0 0 8px;"><strong>${escapeHtml(item.bill_title || "Update")}</strong></p>
      <p style="margin: 0 0 8px; color: #444;">${escapeHtml(billLabel)} · ${escapeHtml(
        item.matched_topic || item.category || ""
      )}</p>
      <p style="margin: 0 0 16px;">${escapeHtml(
        item.action_text || item.summary_excerpt || "New activity on a tracked item."
      )}</p>
      <p><a href="${feedUrl}">Open your feed</a></p>
    </div>
  `;
}

function digestEmailHtml(items, periodLabel) {
  const feedUrl = `${siteBaseUrl()}/bills-policies.html?tab=updates`;
  const rows = items
    .map(
      (item) => `
      <li style="margin-bottom: 12px;">
        <strong>${escapeHtml(item.bill_title || "Update")}</strong><br/>
        <span style="color:#555;">${escapeHtml(
          `${item.bill_type || ""} ${item.bill_number || ""}`.trim()
        )} · ${escapeHtml(item.matched_topic || "")}</span><br/>
        ${escapeHtml(item.action_text || item.summary_excerpt || "")}
      </li>`
    )
    .join("");

  return `
    <div style="font-family: Georgia, serif; line-height: 1.5; color: #111;">
      <h1 style="font-size: 20px;">Your ${escapeHtml(periodLabel)} Congress Bills digest</h1>
      <p>${items.length} update${items.length === 1 ? "" : "s"} since your last digest.</p>
      <ul style="padding-left: 18px;">${rows}</ul>
      <p><a href="${feedUrl}">Open your feed</a></p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseStateFromAddress(address = "") {
  const match = String(address).match(/\b([A-Z]{2})\b(?:\s+\d{5})?/);
  return match ? match[1].toUpperCase() : "";
}

function parseCityFromAddress(address = "") {
  const match = String(address).match(/^([^,]+),/);
  return match ? match[1].trim() : "";
}

module.exports = {
  env,
  siteBaseUrl,
  isFloorVoteAction,
  supabaseRest,
  insertNotification,
  sendEmail,
  notificationEmailHtml,
  digestEmailHtml,
  escapeHtml,
  parseStateFromAddress,
  parseCityFromAddress,
};
