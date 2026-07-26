const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const authStatus = document.getElementById("auth-status");

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

function authRedirectUrl() {
  const url = new URL("auth.html", window.location.href);
  url.searchParams.set("verified", "1");
  return url.toString();
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

signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = getSupabase();
  if (!client) {
    setAuthStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return;
  }

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

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = getSupabase();
  if (!client) {
    setAuthStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return;
  }

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
      emailRedirectTo: authRedirectUrl(),
    },
  });

  if (error) {
    console.error(error);
    setAuthStatus(error.message || "Could not create account.", "error");
    return;
  }

  // If email confirmation is required, there is usually no session yet.
  if (!data.session) {
    setAuthStatus(
      `Account created. Check ${email} for a verification link, then come back to sign in.`,
      "success"
    );
    signupForm.hidden = true;
    signinForm.hidden = false;
    document.getElementById("auth-title").textContent = "Verify your email";
    document.getElementById("auth-subtitle").textContent =
      "Click the link we sent you, then sign in with your username or email and password.";
    return;
  }

  setAuthStatus("Account created. Redirecting…", "loading");
  await finishLogin(data.user);
});

(async function initAuthPage() {
  await bootNav("auth");

  const params = new URLSearchParams(window.location.search);
  const isSignup = params.get("mode") === "signup";
  const justVerified = params.get("verified") === "1";

  if (isSignup) {
    document.title = "Create account · Congress Bills";
    document.getElementById("auth-title").textContent = "Create account";
    document.getElementById("auth-subtitle").textContent =
      "Choose a username and password. We’ll email you a link to verify your account.";
    signinForm.hidden = true;
    signupForm.hidden = false;
  }

  if (justVerified) {
    setAuthStatus(
      "Email verified. Sign in with your username or email and password.",
      "success"
    );
    signinForm.hidden = false;
    signupForm.hidden = true;
    document.getElementById("auth-title").textContent = "Sign in";
  }

  if (!isSupabaseConfigured()) {
    setAuthStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return;
  }

  // Handle redirect from the email verification link (tokens in URL hash).
  const client = getSupabase();
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session?.user) {
      if (justVerified) {
        setAuthStatus("Email verified. Redirecting…", "loading");
      }
      await finishLogin(data.session.user);
    }
  }
})();
