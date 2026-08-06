const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");
const otpRequestForm = document.getElementById("otp-request-form");
const otpVerifyForm = document.getElementById("otp-verify-form");
const checkEmailPanel = document.getElementById("check-email-panel");
const otpResendBtn = document.getElementById("otp-resend-btn");
const authStatus = document.getElementById("auth-status");
const authModeTabs = document.getElementById("auth-mode-tabs");

let pendingOtpEmail = "";
let pendingSignupEmail = "";
let recoveryMode = false;

function setAuthStatus(message, type = "loading") {
  if (!authStatus) return;
  authStatus.hidden = !message;
  authStatus.textContent = message || "";
  authStatus.dataset.type = type;
}

function getNextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return "";
  if (next.includes("://") || next.startsWith("//")) return "";
  return next.replace(/^\//, "");
}

function authRedirectUrl(extraParams = {}) {
  const url = new URL("auth.html", window.location.href);
  const next = getNextPath();
  if (next) url.searchParams.set("next", next);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function hideAllAuthForms() {
  [
    signinForm,
    signupForm,
    forgotForm,
    resetForm,
    otpRequestForm,
    otpVerifyForm,
    checkEmailPanel,
  ].forEach((el) => {
    if (el) el.hidden = true;
  });
}

function setModeTabsVisible(visible) {
  if (!authModeTabs) return;
  authModeTabs.hidden = !visible;
}

function setActiveTab(view) {
  if (!authModeTabs) return;
  const tab = view === "signup" ? "signup" : "signin";
  authModeTabs.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    const active = btn.getAttribute("data-auth-tab") === tab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function showAuthView(view) {
  hideAllAuthForms();
  const title = document.getElementById("auth-title");
  const subtitle = document.getElementById("auth-subtitle");
  const primaryViews = view === "signin" || view === "signup";
  setModeTabsVisible(primaryViews);
  if (primaryViews) setActiveTab(view);

  if (view === "signup") {
    document.title = "Create account · Article 1";
    title.textContent = "Create account";
    subtitle.textContent = "Choose a username, email, and password.";
    signupForm.hidden = false;
    return;
  }

  if (view === "check-email") {
    document.title = "Check your email · Article 1";
    title.textContent = "Check your email";
    subtitle.textContent = "Open the verification link, then sign in.";
    setModeTabsVisible(false);
    if (checkEmailPanel) {
      checkEmailPanel.hidden = false;
      const copy = document.getElementById("check-email-copy");
      if (copy) {
        copy.textContent = pendingSignupEmail
          ? `We sent a link to ${pendingSignupEmail}.`
          : "We sent a verification link to your inbox.";
      }
    }
    return;
  }

  if (view === "forgot") {
    document.title = "Forgot password · Article 1";
    title.textContent = "Reset password";
    subtitle.textContent = "We’ll email a reset link.";
    setModeTabsVisible(false);
    forgotForm.hidden = false;
    return;
  }

  if (view === "reset") {
    document.title = "Choose a new password · Article 1";
    title.textContent = "New password";
    subtitle.textContent = "Save a new password for your account.";
    setModeTabsVisible(false);
    resetForm.hidden = false;
    return;
  }

  if (view === "otp") {
    document.title = "Email code · Article 1";
    title.textContent = "Email code";
    subtitle.textContent = "We’ll send a one-time sign-in code.";
    setModeTabsVisible(false);
    otpRequestForm.hidden = false;
    return;
  }

  if (view === "otp-verify") {
    document.title = "Enter email code · Article 1";
    title.textContent = "Enter code";
    subtitle.textContent = "Use the code from your email.";
    setModeTabsVisible(false);
    otpVerifyForm.hidden = false;
    const sentTo = document.getElementById("otp-sent-to");
    if (sentTo) {
      sentTo.hidden = !pendingOtpEmail;
      sentTo.textContent = pendingOtpEmail
        ? `Sent to ${pendingOtpEmail}.`
        : "";
    }
    return;
  }

  document.title = "Sign in · Article 1";
  title.textContent = "Sign in";
  subtitle.textContent = "Use your email or username and password.";
  signinForm.hidden = false;
}

function friendlyAuthError(error, fallback = "Something went wrong.") {
  const raw = String(error?.message || error || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return fallback;
  if (/user already registered|already been registered|already exists/i.test(raw)) {
    return "An account with that email already exists. Sign in instead, or reset your password.";
  }
  if (/email rate limit|over_email_send_rate_limit/i.test(raw)) {
    return "Too many emails sent. Wait a minute and try again.";
  }
  if (/password.*at least|password.*characters|weak password/i.test(raw)) {
    return "Password must be at least 6 characters.";
  }
  if (/invalid login credentials|invalid email or password/i.test(raw)) {
    return "That email/username and password combination didn’t match.";
  }
  if (/confirm|verified|validat/i.test(raw)) {
    return "Please verify your email first. Check your inbox for the confirmation link.";
  }
  if (/redirect_uri|redirect url|not allowed/i.test(raw)) {
    return "Account could not be created because of a site configuration issue. Try again in a moment.";
  }
  if (/duplicate key|unique constraint|username/i.test(lower) && /username|profiles/i.test(lower)) {
    return "That username is already taken. Try another.";
  }
  return raw || fallback;
}

async function finishLogin(user) {
  const next = getNextPath();
  if (next) {
    window.location.href = next;
    return;
  }
  try {
    if (
      typeof shouldOfferVoterPulse === "function" &&
      (await shouldOfferVoterPulse(user))
    ) {
      window.location.href = "onboarding.html";
      return;
    }
  } catch (error) {
    console.warn(error);
  }
  const follows = await countFollows(user.id);
  window.location.href =
    follows === 0 ? "topics.html" : "bills-policies.html?tab=mine";
}

/** Reject sessions created by accidental magic-link signup (empty profile). */
async function requireRegisteredProfile(user) {
  const client = getSupabase();
  if (!client || !user?.id) return null;

  const { data: profile, error } = await client
    .from("profiles")
    .select("username, email")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new Error("Could not load your profile. Try signing in again.");
  }

  if (profile?.username) return profile;

  // Recover username from auth metadata when the trigger lagged.
  const metaUsername = String(
    user.user_metadata?.username || ""
  )
    .trim()
    .toLowerCase();
  if (/^[a-z0-9_]{3,30}$/.test(metaUsername)) {
    const { error: updateError } = await client
      .from("profiles")
      .update({
        username: metaUsername,
        email: user.email || profile?.email || null,
      })
      .eq("id", user.id);
    if (!updateError) {
      return { username: metaUsername, email: user.email || null };
    }
  }

  await client.auth.signOut();
  throw new Error(
    "No account found for that email. Create an account first, then sign in."
  );
}

async function resolveEmail(identifier) {
  const value = String(identifier || "").trim();
  if (!value) throw new Error("Enter your email or username.");
  if (value.includes("@")) return value.toLowerCase();

  const client = getSupabase();
  const { data, error } = await client.rpc("get_email_for_username", {
    uname: value,
  });

  if (error) {
    console.error(error);
    throw new Error("Could not look up that username.");
  }

  if (!data) {
    throw new Error("No account found for that username.");
  }

  return data;
}

async function usernameTaken(username) {
  const client = getSupabase();
  if (!client) return false;
  const { data, error } = await client.rpc("get_email_for_username", {
    uname: username,
  });
  if (error) {
    console.warn("username check failed:", error);
    return false;
  }
  return Boolean(data);
}

async function ensureProfileUsername(user, username, email) {
  const client = getSupabase();
  if (!client || !user?.id || !username) return;
  const { error } = await client
    .from("profiles")
    .update({
      username: String(username).toLowerCase(),
      email: email || user.email || null,
    })
    .eq("id", user.id);
  if (error) console.warn("Could not sync profile username:", error);
}

function requireSupabaseClient() {
  const client = getSupabase();
  if (!client) {
    setAuthStatus(
      "Sign-in is temporarily unavailable. Please try again soon.",
      "error"
    );
    return null;
  }
  return client;
}

document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    const view = btn.getAttribute("data-auth-tab") || "signin";
    setAuthStatus("");
    showAuthView(view === "signup" ? "signup" : "signin");
    const url = new URL(window.location.href);
    if (view === "signup") url.searchParams.set("mode", "signup");
    else url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.toString());
  });
});

signinForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = requireSupabaseClient();
  if (!client) return;

  const identifier = document.getElementById("signin-identifier").value;
  const password = document.getElementById("signin-password").value;

  setAuthStatus("Signing in…", "loading");

  try {
    const email = await resolveEmail(identifier);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      setAuthStatus(friendlyAuthError(error, "Could not sign in."), "error");
      return;
    }

    const user = data.user || data.session?.user;
    if (!user) {
      setAuthStatus("Signed in, but no user session was returned.", "error");
      return;
    }

    await requireRegisteredProfile(user);
    setAuthStatus("Signed in. Redirecting…", "loading");
    await finishLogin(user);
  } catch (error) {
    console.error(error);
    setAuthStatus(friendlyAuthError(error, "Could not sign in."), "error");
  }
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = requireSupabaseClient();
  if (!client) return;

  const username = document
    .getElementById("signup-username")
    .value.trim()
    .toLowerCase();
  const email = document.getElementById("signup-email").value.trim().toLowerCase();
  const password = document.getElementById("signup-password").value;

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    setAuthStatus(
      "Username must be 3–30 characters: letters, numbers, or underscores.",
      "error"
    );
    return;
  }
  if (!email.includes("@")) {
    setAuthStatus("Enter a valid email address.", "error");
    return;
  }
  if (password.length < 6) {
    setAuthStatus("Password must be at least 6 characters.", "error");
    return;
  }

  setAuthStatus("Checking username…", "loading");
  try {
    if (await usernameTaken(username)) {
      setAuthStatus("That username is already taken. Try another.", "error");
      return;
    }
  } catch (error) {
    console.warn(error);
  }

  setAuthStatus("Creating your account…", "loading");

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: authRedirectUrl({ verified: "1" }),
    },
  });

  if (error) {
    console.error(error);
    setAuthStatus(friendlyAuthError(error, "Could not create account."), "error");
    return;
  }

  // Supabase returns an empty identities array when the email is already registered.
  const identities = data?.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    setAuthStatus(
      "An account with that email already exists. Sign in instead, or reset your password.",
      "error"
    );
    showAuthView("signin");
    const emailInput = document.getElementById("signin-identifier");
    if (emailInput) emailInput.value = email;
    return;
  }

  pendingSignupEmail = email;

  if (!data.session) {
    setAuthStatus("");
    showAuthView("check-email");
    return;
  }

  await ensureProfileUsername(data.user, username, email);
  setAuthStatus("Account created. Redirecting…", "loading");
  await finishLogin(data.user);
});

forgotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = requireSupabaseClient();
  if (!client) return;

  const identifier = document.getElementById("forgot-identifier").value;
  setAuthStatus("Sending password reset…", "loading");

  try {
    const email = await resolveEmail(identifier);

    try {
      await postAuthCode({ identifier: email, purpose: "check" });
    } catch (checkError) {
      if (
        checkError?.status === 404 ||
        /no account found/i.test(checkError?.message || "")
      ) {
        setAuthStatus(
          "No account found for that email. Create an account first.",
          "error"
        );
        return;
      }
      if (!String(identifier || "").includes("@")) {
        // username resolved → account exists
      } else {
        console.warn("Account check unavailable:", checkError);
      }
    }

    const { error: recoverError } = await client.auth.resetPasswordForEmail(
      email,
      { redirectTo: authRedirectUrl({ reset: "1" }) }
    );
    if (recoverError) {
      console.error(recoverError);
      setAuthStatus(
        friendlyAuthError(recoverError, "Could not start password reset."),
        "error"
      );
      return;
    }

    try {
      const payload = await postAuthCode({
        identifier: email,
        purpose: "recovery",
      });
      pendingOtpEmail = payload.email;
      window.__pendingPasswordReset = true;
      showAuthView("otp-verify");
      document.getElementById("auth-title").textContent = "Enter reset code";
      document.getElementById("auth-subtitle").textContent =
        "Enter the code from your email, then choose a new password.";
      setAuthStatus(
        `Reset email sent to ${payload.email}. Check inbox and spam.`,
        "success"
      );
      document.getElementById("otp-code")?.focus();
      return;
    } catch (serverError) {
      if (
        serverError?.status === 404 ||
        /no account found/i.test(serverError?.message || "")
      ) {
        setAuthStatus(
          "No account found for that email. Create an account first.",
          "error"
        );
        return;
      }
      console.warn("Resend recovery unavailable:", serverError);
    }

    setAuthStatus(
      `Password reset email sent to ${email}. Check inbox and spam, then open the link.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    setAuthStatus(
      friendlyAuthError(error, "Could not send reset email."),
      "error"
    );
  }
});

resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = requireSupabaseClient();
  if (!client) return;

  const password = document.getElementById("reset-password").value;
  const confirm = document.getElementById("reset-password-confirm").value;
  if (password !== confirm) {
    setAuthStatus("Passwords do not match.", "error");
    return;
  }
  if (password.length < 6) {
    setAuthStatus("Password must be at least 6 characters.", "error");
    return;
  }

  setAuthStatus("Updating password…", "loading");
  const { data, error } = await client.auth.updateUser({ password });
  if (error) {
    console.error(error);
    setAuthStatus(
      friendlyAuthError(error, "Could not update password."),
      "error"
    );
    return;
  }

  recoveryMode = false;
  setAuthStatus("Password updated. Redirecting…", "loading");
  const user = data.user;
  if (user) {
    await finishLogin(user);
    return;
  }
  showAuthView("signin");
  setAuthStatus("Password updated. Sign in with your new password.", "success");
});

async function postAuthCode({ identifier, purpose }) {
  const endpoints = ["/api/send-auth-code"];
  if (
    typeof location !== "undefined" &&
    location.origin &&
    !location.origin.includes("vercel.app")
  ) {
    endpoints.push(
      "https://congress-bills-dashboard.vercel.app/api/send-auth-code"
    );
  }

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, purpose }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        return payload;
      }
      const err = new Error(
        payload.error || `Could not send email (${response.status}).`
      );
      err.status = response.status;
      lastError = err;
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not send email code.");
}

async function sendSignInCode(identifier) {
  try {
    const payload = await postAuthCode({
      identifier,
      purpose: "signin",
    });
    pendingOtpEmail = payload.email;
    return true;
  } catch (serverError) {
    if (
      serverError?.status === 404 ||
      /no account found/i.test(serverError?.message || "")
    ) {
      throw serverError;
    }
    console.warn("send-auth-code API failed, trying Supabase OTP:", serverError);
  }

  const client = requireSupabaseClient();
  if (!client) return false;

  const email = await resolveEmail(identifier);
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: authRedirectUrl(),
    },
  });
  if (error) {
    console.error(error);
    const hint = /signups not allowed|user not found|unable to validate/i.test(
      error.message || ""
    )
      ? " No account found for that email — create an account first."
      : "";
    throw new Error(
      friendlyAuthError(error, "Could not send sign-in code.") + hint
    );
  }
  pendingOtpEmail = email;
  return true;
}

otpRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identifier = document.getElementById("otp-identifier").value;
  setAuthStatus("Sending sign-in code…", "loading");
  try {
    await sendSignInCode(identifier);
    showAuthView("otp-verify");
    setAuthStatus(
      `Code sent to ${pendingOtpEmail}. Check inbox and spam.`,
      "success"
    );
    document.getElementById("otp-code")?.focus();
  } catch (error) {
    console.error(error);
    setAuthStatus(
      friendlyAuthError(error, "Could not send sign-in code."),
      "error"
    );
  }
});

otpVerifyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = requireSupabaseClient();
  if (!client) return;

  const token = String(document.getElementById("otp-code").value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!pendingOtpEmail) {
    setAuthStatus("Request a new code first.", "error");
    showAuthView("otp");
    return;
  }
  if (token.length < 6) {
    setAuthStatus("Enter the full code from your email.", "error");
    return;
  }

  setAuthStatus("Verifying code…", "loading");

  const typesToTry = window.__pendingPasswordReset
    ? ["recovery", "email", "magiclink"]
    : ["email", "magiclink"];

  let data = null;
  let lastVerifyError = null;
  for (const type of typesToTry) {
    const result = await client.auth.verifyOtp({
      email: pendingOtpEmail,
      token,
      type,
    });
    if (!result.error && (result.data?.user || result.data?.session?.user)) {
      data = result.data;
      lastVerifyError = null;
      break;
    }
    lastVerifyError = result.error;
  }

  if (!data) {
    console.error(lastVerifyError);
    setAuthStatus(
      friendlyAuthError(lastVerifyError, "That code is invalid or expired."),
      "error"
    );
    return;
  }

  const user = data.user || data.session?.user;
  if (!user) {
    setAuthStatus("Code accepted, but no session was returned.", "error");
    return;
  }

  if (window.__pendingPasswordReset) {
    window.__pendingPasswordReset = false;
    recoveryMode = true;
    showAuthView("reset");
    setAuthStatus("Code verified. Choose a new password.", "success");
    return;
  }

  try {
    await requireRegisteredProfile(user);
  } catch (profileError) {
    console.error(profileError);
    setAuthStatus(
      friendlyAuthError(
        profileError,
        "No account found for that email. Create an account first."
      ),
      "error"
    );
    showAuthView("signup");
    return;
  }

  setAuthStatus("Signed in. Redirecting…", "loading");
  await finishLogin(user);
});

otpResendBtn?.addEventListener("click", async () => {
  if (!pendingOtpEmail) {
    showAuthView("otp");
    return;
  }
  setAuthStatus("Resending code…", "loading");
  try {
    await sendSignInCode(pendingOtpEmail);
    setAuthStatus(`New code sent to ${pendingOtpEmail}.`, "success");
  } catch (error) {
    console.error(error);
    setAuthStatus(
      friendlyAuthError(error, "Could not resend code."),
      "error"
    );
  }
});

function hashParams() {
  const raw = String(window.location.hash || "").replace(/^#/, "");
  return new URLSearchParams(raw);
}

(async function initAuthPage() {
  await bootNav("auth");

  const params = new URLSearchParams(window.location.search);
  const mode = String(params.get("mode") || "").toLowerCase();
  const justVerified = params.get("verified") === "1";
  const resetFlag = params.get("reset") === "1";
  const hash = hashParams();
  const hashType = String(hash.get("type") || "").toLowerCase();

  if (mode === "signup") showAuthView("signup");
  else if (mode === "forgot") showAuthView("forgot");
  else if (mode === "otp") showAuthView("otp");
  else showAuthView("signin");

  if (justVerified) {
    showAuthView("signin");
    setAuthStatus(
      "Email verified. Sign in with your email or username and password.",
      "success"
    );
  }

  if (!isSupabaseConfigured()) {
    setAuthStatus(
      "Sign-in is temporarily unavailable. Please try again soon.",
      "error"
    );
    return;
  }

  const client = getSupabase();
  if (!client) return;

  client.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      showAuthView("reset");
      setAuthStatus(
        "Choose a new password to finish resetting your account.",
        "success"
      );
      return;
    }
    if (
      (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
      session?.user &&
      recoveryMode
    ) {
      showAuthView("reset");
    }
  });

  if (hashType === "recovery" || resetFlag) {
    recoveryMode = true;
    showAuthView("reset");
    setAuthStatus(
      "Choose a new password to finish resetting your account.",
      "success"
    );
  }

  const { data } = await client.auth.getSession();
  if (data.session?.user) {
    if (recoveryMode || hashType === "recovery" || resetFlag) {
      recoveryMode = true;
      showAuthView("reset");
      setAuthStatus(
        "Choose a new password to finish resetting your account.",
        "success"
      );
      return;
    }
    try {
      await requireRegisteredProfile(data.session.user);
    } catch (profileError) {
      console.error(profileError);
      showAuthView("signup");
      setAuthStatus(
        friendlyAuthError(
          profileError,
          "No account found for that email. Create an account first."
        ),
        "error"
      );
      return;
    }
    if (justVerified) {
      setAuthStatus("Email verified. Redirecting…", "loading");
    }
    await finishLogin(data.session.user);
  }
})();
