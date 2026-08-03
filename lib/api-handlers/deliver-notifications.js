const {
  env,
  supabaseRest,
  insertNotification,
  sendEmail,
  notificationEmailHtml,
  digestEmailHtml,
} = require("../notify");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function hoursSince(value) {
  if (!value) return Infinity;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60 * 60);
}

function fingerprint(parts) {
  return parts
    .map((part) => String(part || ""))
    .join("|")
    .toLowerCase();
}

async function markEmailSent(ids) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  for (const id of ids) {
    await supabaseRest(`notifications?id=eq.${id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { email_sent_at: now },
    });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!env("SUPABASE_URL") || !env("SUPABASE_SERVICE_ROLE_KEY")) {
    return json(res, 500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  try {
    const profiles = await supabaseRest(
      "profiles?select=id,email,notify_critical,notify_digest,notify_neighborhood,last_digest_sent_at"
    );

    let criticalEmails = 0;
    let digestEmails = 0;
    let digestNotifications = 0;
    let skippedEmail = 0;

    // 1) Email any unsent critical alerts for users who opted in
    const criticalPending = await supabaseRest(
      "notifications?category=eq.critical&email_sent_at=is.null&select=*&order=created_at.desc&limit=100"
    );

    for (const item of criticalPending || []) {
      const profile = (profiles || []).find((row) => row.id === item.user_id);
      if (!profile || profile.notify_critical === false) {
        await markEmailSent([item.id]);
        continue;
      }
      if (!profile.email) {
        skippedEmail += 1;
        continue;
      }

      const result = await sendEmail({
        to: profile.email,
        subject: `Critical bill alert: ${item.bill_title || "Tracked bill"}`,
        html: notificationEmailHtml(item, {
          heading: "Critical action alert",
        }),
        text: `${item.bill_title}\n${item.action_text || ""}\nOpen your feed for details.`,
      });

      if (result.ok) {
        await markEmailSent([item.id]);
        criticalEmails += 1;
      } else if (result.skipped) {
        skippedEmail += 1;
      } else {
        console.error("Critical email failed:", result.reason);
      }
    }

    // 2) Digests for daily / weekly subscribers
    for (const profile of profiles || []) {
      const digest = profile.notify_digest || "weekly";
      if (digest === "off") continue;

      const neededHours = digest === "daily" ? 20 : 20 * 7;
      if (hoursSince(profile.last_digest_sent_at) < neededHours) continue;

      const sinceIso = profile.last_digest_sent_at
        ? new Date(profile.last_digest_sent_at).toISOString()
        : new Date(Date.now() - neededHours * 3600 * 1000).toISOString();

      const items = await supabaseRest(
        `notifications?user_id=eq.${profile.id}&category=in.(topic,neighborhood)&created_at=gte.${encodeURIComponent(
          sinceIso
        )}&select=*&order=created_at.desc&limit=40`
      );

      if (!items?.length) {
        await supabaseRest(`profiles?id=eq.${profile.id}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: { last_digest_sent_at: new Date().toISOString() },
        });
        continue;
      }

      const periodLabel = digest === "daily" ? "daily" : "weekly";
      const digestTitle = `Your ${periodLabel} digest (${items.length} updates)`;
      const digestBody = items
        .slice(0, 8)
        .map(
          (item) =>
            `${item.bill_type || ""} ${item.bill_number || ""}`.trim() +
            ` — ${item.bill_title || "Update"}`
        )
        .join("; ");

      const digestFp = fingerprint([
        profile.id,
        periodLabel,
        sinceIso,
        items[0]?.id,
        "digest",
      ]);

      const created = await insertNotification({
        user_id: profile.id,
        bill_congress: 0,
        bill_type: "DIGEST",
        bill_number: periodLabel,
        bill_title: digestTitle,
        matched_topic: `${periodLabel} digest`,
        matched_kind: "digest",
        category: "digest",
        action_text: digestBody,
        action_date: new Date().toISOString().slice(0, 10),
        summary_excerpt: digestBody,
        update_fingerprint: digestFp,
      });
      if (created) digestNotifications += 1;

      if (profile.email) {
        const result = await sendEmail({
          to: profile.email,
          subject: digestTitle,
          html: digestEmailHtml(items.slice(0, 20), periodLabel),
          text: `${digestTitle}\n\n${items
            .slice(0, 20)
            .map(
              (item) =>
                `- ${item.bill_title}: ${item.action_text || item.summary_excerpt || ""}`
            )
            .join("\n")}`,
        });
        if (result.ok) digestEmails += 1;
        else if (result.skipped) skippedEmail += 1;
        else console.error("Digest email failed:", result.reason);
      } else {
        skippedEmail += 1;
      }

      await supabaseRest(`profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { last_digest_sent_at: new Date().toISOString() },
      });
    }

    return json(res, 200, {
      ok: true,
      criticalEmails,
      digestEmails,
      digestNotifications,
      skippedEmail,
      resendConfigured: Boolean(env("RESEND_API_KEY")),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error.message || "Notification delivery failed",
    });
  }
};
