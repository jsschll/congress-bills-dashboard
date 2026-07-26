const emailForm = document.getElementById("email-form");
const otpForm = document.getElementById("otp-form");
const emailInput = document.getElementById("email-input");
const otpInput = document.getElementById("otp-input");
const authStatus = document.getElementById("auth-status");

let pendingEmail = "";

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

async function finishLogin(user) {
  const follows = await countFollows(user.id);
  const next = getNextPath();
  if (next) {
    window.location.href = next;
    return;
  }
  window.location.href = follows === 0 ? "topics.html" : "feed.html";
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = getSupabase();
  if (!client) {
    setAuthStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return;
  }

  pendingEmail = emailInput.value.trim();
  if (!pendingEmail) return;

  setAuthStatus("Sending one-time code…", "loading");
  const { error } = await client.auth.signInWithOtp({
    email: pendingEmail,
    options: { shouldCreateUser: true },
  });

  if (error) {
    console.error(error);
    setAuthStatus(error.message || "Could not send code.", "error");
    return;
  }

  setAuthStatus(`Code sent to ${pendingEmail}. Check your email.`, "success");
  authStatus.hidden = false;
  authStatus.dataset.type = "loading";
  otpForm.hidden = false;
  otpInput.focus();
});

otpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = getSupabase();
  if (!client) return;

  const token = otpInput.value.trim();
  if (!token || !pendingEmail) return;

  setAuthStatus("Verifying code…", "loading");
  const { data, error } = await client.auth.verifyOtp({
    email: pendingEmail,
    token,
    type: "email",
  });

  if (error) {
    console.error(error);
    setAuthStatus(error.message || "Invalid or expired code.", "error");
    return;
  }

  const user = data.user || data.session?.user;
  if (!user) {
    setAuthStatus("Signed in, but no user session was returned.", "error");
    return;
  }

  setAuthStatus("Signed in. Redirecting…", "loading");
  await finishLogin(user);
});

(async function initAuthPage() {
  await bootNav("auth");

  const params = new URLSearchParams(window.location.search);
  const isSignup = params.get("mode") === "signup";
  if (isSignup) {
    document.title = "Create account · Congress Bills";
    document.getElementById("auth-title").textContent = "Create account";
    document.getElementById("auth-subtitle").textContent =
      "Enter your email to create an account. We’ll send a one-time code to verify it.";
  }

  const existing = await getUser();
  if (existing) {
    await finishLogin(existing);
  }
})();
