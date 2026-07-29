const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");
const otpRequestForm = document.getElementById("otp-request-form");
const otpVerifyForm = document.getElementById("otp-verify-form");
const otpResendBtn = document.getElementById("otp-resend-btn");
const authStatus = document.getElementById("auth-status");

let pendingOtpEmail = "";
let recoveryMode = false;

function setAuthStatus(message, type = "loading") {
  authStatus.hidden = !message;
  authStatus.textContent = message;
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
  ].forEach((form) => {
    if (form) form.hidden = true;
  });
}

function showAuthView(view) {
  hideAllAuthForms();
  const title = document.getElementById("auth-title");
  const subtitle = document.getElementById("auth-subtitle");

  if (view === "signup") {
    document.title = "Create account · Congress Bills";
    title.textContent = "Create account";
    subtitle.textContent =
      "Choose a username and password. We’ll email you a link to verify your account.";
    signupForm.hidden = false;
    return;
  }

  if (view === "forgot") {
    document.title = "Forgot password · Congress Bills";
    title.textContent = "Forgot password";
    subtitle.textContent =
      "Enter your email or username and we’ll send a reset link.";
    forgotForm.hidden = false;
    return;
  }

  if (view === "reset") {
    document.title = "Choose a new password · Congress Bills";
    title.textContent = "Choose a new password";
    subtitle.textContent =
      "Pick a new password for your account. You’ll stay signed in after saving.";
    resetForm.hidden = false;
    return;
  }

  if (view === "otp") {
    document.title = "Sign in with email code · Congress Bills";
    title.textContent = "Sign in with email code";
    subtitle.textContent =
      "We’ll email a one-time code. No password needed for this sign-in.";
    otpRequestForm.hidden = false;
    return;
  }

  if (view === "otp-verify") {
    document.title = "Enter email code · Congress Bills";
    title.textContent = "Enter your email code";
    subtitle.textContent =
      "Type the code from your inbox to finish signing in.";
    otpVerifyForm.hidden = false;
    const sentTo = document.getElementById("otp-sent-to");
    if (sentTo) {
      sentTo.hidden = !pendingOtpEmail;
      sentTo.textContent = pendingOtpEmail
        ? `Code sent to ${pendingOtpEmail}.`
        : "";
    }
    return;
  }

  document.title = "Sign in · Congress Bills";
  title.textContent = "Sign in";
  subtitle.textContent =
    "Sign in with your email or username and password, or request a one-time code by email.";
  signinForm.hidden = false;
}

async function finishLogin(user) {
  const follows = await countFollows(user.id);
  const next = getNextPath();
  if (next) {
    window.location.href = next;
    return;
  }
  window.location.href =
    follows === 0 ? "topics.html" : "bills-policies.html?tab=mine";
}

async function resolveEmail(identifier) {
  const value = identifier.trim();
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

function requireSupabaseClient() {
  const client = getSupabase();
  if (!client) {
    setAuthStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return null;
  }
  return client;
}

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
      const message = /confirm|verified|validat/i.test(error.message || "")
        ? "Please verify your email first. Check your inbox for the confirmation link."
        : error.message || "Could not sign in.";
      setAuthStatus(message, "error");
      return;
    }

    const user = data.user || data.session?.user;
    if (!user) {
      setAuthStatus("Signed in, but no user session was returned.", "error");
      return;
    }

    setAuthStatus("Signed in. Redirecting…", "loading");
    await finishLogin(user);
  } catch (error) {
    console.error(error);
    setAuthStatus(error.message || "Could not sign in.", "error");
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
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    setAuthStatus(
      "Username must be 3–30 characters: letters, numbers, or underscores.",
      "error"
    );
    return;
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
    setAuthStatus(error.message || "Could not create account.", "error");
    return;
  }

  if (!data.session) {
    setAuthStatus(
      `Account created. Check ${email} for a verification link, then come back to sign in.`,
      "success"
    );
    showAuthView("signin");
    document.getElementById("auth-title").textContent = "Verify your email";
    document.getElementById("auth-subtitle").textContent =
      "Click the link we sent you, then sign in with your username or email and password.";
    return;
  }

  setAuthStatus("Account created. Redirecting…", "loading");
  await finishLogin(data.user);
});

forgotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const identifier = document.getElementById("forgot-identifier").value;
  setAuthStatus("Sending reset email…", "loading");

  try {
    // Prefer Resend-delivered code/link so reset emails actually arrive.
    try {
      const payload = await postAuthCode({
        identifier,
        purpose: "recovery",
      });
      pendingOtpEmail = payload.email;
      showAuthView("otp-verify");
      document.getElementById("auth-title").textContent = "Enter reset code";
      document.getElementById("auth-subtitle").textContent =
        "Enter the code from your email, then choose a new password.";
      setAuthStatus(
        `Reset code sent to ${payload.email}. Check inbox and spam, then enter it below.`,
        "success"
      );
      // After OTP verify we'll be signed in via recovery-equivalent session;
      // route password update by flipping recoveryMode on successful verify.
      window.__pendingPasswordReset = true;
      document.getElementById("otp-code")?.focus();
      return;
    } catch (serverError) {
      console.warn("recovery send-auth-code failed, using Supabase email:", serverError);
    }

    const client = requireSupabaseClient();
    if (!client) return;
    const email = await resolveEmail(identifier);
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl({ reset: "1" }),
    });
    if (error) {
      console.error(error);
      setAuthStatus(error.message || "Could not send reset email.", "error");
      return;
    }
    setAuthStatus(
      `If an account exists for ${email}, a password reset email is on the way. Check your inbox and spam folder.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    setAuthStatus(error.message || "Could not send reset email.", "error");
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
    setAuthStatus(error.message || "Could not update password.", "error");
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
      lastError = new Error(
        payload.error || `Could not send email (${response.status}).`
      );
      // Don't fall through hosts on explicit client errors.
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not send email code.");
}

async function sendSignInCode(identifier) {
  // Prefer server-sent codes via Resend so users get a visible OTP
  // (Supabase's default template is a magic link, and built-in mail is unreliable).
  try {
    const payload = await postAuthCode({
      identifier,
      purpose: "signin",
    });
    pendingOtpEmail = payload.email;
    return true;
  } catch (serverError) {
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
    throw new Error((error.message || "Could not send sign-in code.") + hint);
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
      `Code sent to ${pendingOtpEmail}. Check inbox and spam, then enter it below.`,
      "success"
    );
    document.getElementById("otp-code")?.focus();
  } catch (error) {
    console.error(error);
    setAuthStatus(error.message || "Could not send sign-in code.", "error");
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
      lastVerifyError?.message || "That code is invalid or expired.",
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
    setAuthStatus(error.message || "Could not resend code.", "error");
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
      "Email verified. Sign in with your username or email and password.",
      "success"
    );
  }

  if (!isSupabaseConfigured()) {
    setAuthStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
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
      setAuthStatus("Choose a new password to finish resetting your account.", "success");
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

  // Recovery / magic-link tokens arrive in the URL hash.
  if (hashType === "recovery" || resetFlag) {
    recoveryMode = true;
    showAuthView("reset");
    setAuthStatus("Choose a new password to finish resetting your account.", "success");
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
    if (justVerified) {
      setAuthStatus("Email verified. Redirecting…", "loading");
    }
    await finishLogin(data.session.user);
  }
})();
