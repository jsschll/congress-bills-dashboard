const { createClient } = require("@supabase/supabase-js");

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

function siteBaseUrl(req) {
  const configured = env("SITE_URL", "NEXT_PUBLIC_SITE_URL");
  if (configured) return configured.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return "https://congress-bills-dashboard.vercel.app";
}

function adminClient() {
  // URL is public (also in config.js); service role must still come from Vercel env.
  const url =
    env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveEmail(identifier, supabase) {
  const value = String(identifier || "").trim();
  if (!value) return "";
  if (value.includes("@")) return value.toLowerCase();

  const { data, error } = await supabase.rpc("get_email_for_username", {
    uname: value,
  });
  if (error) {
    const err = new Error(error.message || "Could not look up that username.");
    err.status = 400;
    throw err;
  }
  if (!data) {
    const err = new Error("No account found for that username.");
    err.status = 404;
    throw err;
  }
  return String(data).toLowerCase();
}

async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = env("RESEND_API_KEY");
  const from =
    env("NOTIFY_FROM_EMAIL", "EMAIL_FROM") ||
    "Congress Bills <onboarding@resend.dev>";
  if (!apiKey) {
    const err = new Error(
      "Email delivery is not configured (missing RESEND_API_KEY on Vercel)."
    );
    err.status = 503;
    throw err;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(
      data?.message || data?.error || `Resend failed (${response.status})`
    );
    err.status = 502;
    throw err;
  }
  return data;
}

function codeEmail({ code, purpose }) {
  const heading =
    purpose === "recovery" ? "Reset your password" : "Your sign-in code";
  const lead =
    purpose === "recovery"
      ? "Use this code on the password reset page, or open the reset link if one was included."
      : "Enter this code on the Congress Bills sign-in page to finish signing in.";
  return {
    subject: `${code} is your Congress Bills ${
      purpose === "recovery" ? "reset" : "sign-in"
    } code`,
    text: `${heading}\n\n${lead}\n\nCode: ${code}\n\nThis code expires soon. If you did not request it, you can ignore this email.`,
    html: `<div style="font-family:Figtree,Segoe UI,sans-serif;line-height:1.5;color:#1a2332">
      <h1 style="font-size:1.35rem;margin:0 0 0.75rem">${heading}</h1>
      <p style="margin:0 0 1rem">${lead}</p>
      <p style="font-size:2rem;letter-spacing:0.18em;font-weight:700;margin:0 0 1rem">${code}</p>
      <p style="color:#5c6b7a;margin:0;font-size:0.95rem">This code expires soon. If you did not request it, you can ignore this email.</p>
    </div>`,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const supabase = adminClient();
  if (!supabase) {
    return json(res, 503, {
      error:
        "Server auth email is not configured. Add SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY in Vercel → Project Settings → Environment Variables, then Redeploy.",
      missing: ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"],
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  body = body || {};

  const purpose = String(body.purpose || "signin").toLowerCase();
  const linkType = purpose === "recovery" || purpose === "reset" ? "recovery" : "magiclink";

  try {
    const email = await resolveEmail(body.email || body.identifier, supabase);
    if (!email || !email.includes("@")) {
      return json(res, 400, { error: "Enter a valid email or username." });
    }

    const redirectTo = `${siteBaseUrl(req)}/auth.html${
      linkType === "recovery" ? "?reset=1" : ""
    }`;

    const { data, error } = await supabase.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo },
    });

    if (error) {
      console.error("generateLink failed:", error);
      return json(res, 400, {
        error: error.message || "Could not create a sign-in code for that account.",
      });
    }

    const code =
      data?.properties?.email_otp ||
      data?.email_otp ||
      data?.user?.email_otp ||
      "";
    if (!code) {
      console.error("generateLink missing email_otp:", data);
      return json(res, 500, {
        error: "Auth provider did not return an email code. Try again shortly.",
      });
    }

    const mail = codeEmail({
      code,
      purpose: linkType === "recovery" ? "recovery" : "signin",
    });
    await sendResendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    return json(res, 200, {
      ok: true,
      email,
      purpose: linkType === "recovery" ? "recovery" : "signin",
      message: `Code sent to ${email}. Check your inbox and spam folder.`,
    });
  } catch (error) {
    console.error("send-auth-code failed:", error);
    return json(res, error.status || 500, {
      error: error.message || "Could not send email code.",
    });
  }
};
