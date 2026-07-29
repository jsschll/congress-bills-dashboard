const NAV_LOGO_SVG = `
  <span class="app-nav__logo" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 19h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M7 19V9.5L12 6l5 3.5V19" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M10 19v-4h4v4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M9.5 12.5h1M13.5 12.5h1M9.5 15h1M13.5 15h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  </span>
`.trim();

function buildLoggedOutActions(actions) {
  actions.replaceChildren();

  const signIn = document.createElement("a");
  signIn.className = "app-nav__button app-nav__button--ghost";
  signIn.href = "auth.html";
  signIn.textContent = "Sign in";

  const signUp = document.createElement("a");
  signUp.className = "app-nav__button app-nav__button--primary";
  signUp.href = "auth.html?mode=signup";
  signUp.textContent = "Sign up";

  actions.append(signIn, signUp);
}

function buildLoggedInActions(actions, { userLabel, onSignOut }) {
  actions.replaceChildren();

  const profile = document.createElement("a");
  profile.className = "app-nav__button app-nav__button--ghost";
  profile.href = "profile.html";
  profile.textContent = "Profile";
  if (userLabel) profile.title = userLabel;

  const outBtn = document.createElement("button");
  outBtn.type = "button";
  outBtn.className = "app-nav__button app-nav__button--primary";
  outBtn.textContent = "Sign out";
  outBtn.addEventListener("click", onSignOut);

  actions.append(profile, outBtn);
}

function syncHeaderAuth(user) {
  const headerActions = document.querySelector(".header__actions");
  if (!headerActions) return;

  const refreshBtn = headerActions.querySelector("#refresh-btn");
  headerActions.replaceChildren();

  if (user) {
    const profile = document.createElement("a");
    profile.className = "app-nav__button app-nav__button--ghost";
    profile.href = "profile.html";
    profile.textContent = "Profile";

    const outBtn = document.createElement("button");
    outBtn.type = "button";
    outBtn.className = "app-nav__button app-nav__button--primary";
    outBtn.textContent = "Sign out";
    outBtn.addEventListener("click", () => signOut());
    headerActions.append(profile, outBtn);
  } else {
    const signIn = document.createElement("a");
    signIn.className = "app-nav__button app-nav__button--ghost";
    signIn.href = "auth.html";
    signIn.textContent = "Sign in";

    const signUp = document.createElement("a");
    signUp.className = "app-nav__button app-nav__button--primary";
    signUp.href = "auth.html?mode=signup";
    signUp.textContent = "Sign up";

    headerActions.append(signIn, signUp);
  }

  if (refreshBtn) headerActions.append(refreshBtn);
}

function createNavShell(activePage = "home") {
  let nav = document.getElementById("app-nav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "app-nav";
    nav.className = "app-nav";
    nav.setAttribute("aria-label", "Main");
    document.body.prepend(nav);
  }

  nav.className = "app-nav";
  nav.setAttribute("aria-label", "Main");

  const link = (page, href, label) =>
    `<a class="app-nav__link ${
      activePage === page ? "is-active" : ""
    }" href="${href}"${activePage === page ? ' aria-current="page"' : ""}>${label}</a>`;

  const feedActive =
    activePage === "feed" || activePage === "bills-policies" ? "is-active" : "";

  nav.innerHTML = `
    <div class="app-nav__inner">
      <a class="app-nav__brand" href="index.html">
        ${NAV_LOGO_SVG}
        <span class="app-nav__brand-text">Congress Bills</span>
      </a>
      <div class="app-nav__links">
        ${link("home", "index.html", "Home")}
        ${link("search", "search.html", "Search")}
        <a class="app-nav__link ${feedActive}" href="bills-policies.html"${
          feedActive ? ' aria-current="page"' : ""
        }>Feed</a>
        ${link("topics", "topics.html", "Topics")}
        ${link("politicians", "politicians.html", "Politicians")}
        ${link("profile", "profile.html", "Profile")}
      </div>
      <div class="app-nav__actions" id="app-nav-actions"></div>
    </div>
  `;

  const actions = nav.querySelector("#app-nav-actions");
  buildLoggedOutActions(actions);
  return { nav, actions };
}

async function getProfileLabel(user) {
  const client = getSupabase();
  if (!client || !user) return user?.email || "Signed in";

  const { data } = await client
    .from("profiles")
    .select("username, email")
    .eq("id", user.id)
    .maybeSingle();

  return data?.username || data?.email || user.email || "Signed in";
}

async function renderAppNav(activePage = "home") {
  const { actions } = createNavShell(activePage);

  let user = null;
  try {
    user = await getUser();
  } catch (error) {
    console.error(error);
  }

  syncHeaderAuth(user);

  if (!user) {
    buildLoggedOutActions(actions);
    if (!isSupabaseConfigured()) {
      const hint = document.createElement("span");
      hint.className = "app-nav__hint";
      hint.textContent = "Add SUPABASE_ANON_KEY in config.js";
      actions.prepend(hint);
    }
    return;
  }

  actions.replaceChildren();

  let unreadCount = 0;
  let notifications = [];
  try {
    notifications = await fetchNotifications({ limit: 8 });
    unreadCount = notifications.filter((item) => !item.read_at).length;
  } catch (error) {
    console.error(error);
  }

  const bellWrap = document.createElement("div");
  bellWrap.className = "notif-bell";

  const bellBtn = document.createElement("button");
  bellBtn.type = "button";
  bellBtn.className = "notif-bell__button";
  bellBtn.setAttribute("aria-label", "Notifications");
  bellBtn.setAttribute("aria-expanded", "false");
  bellBtn.innerHTML = `
    <span class="notif-bell__icon" aria-hidden="true">🔔</span>
    ${
      unreadCount
        ? `<span class="notif-bell__badge">${unreadCount > 9 ? "9+" : unreadCount}</span>`
        : ""
    }
  `;

  const panel = document.createElement("div");
  panel.className = "notif-bell__panel";
  panel.hidden = true;

  if (notifications.length === 0) {
    panel.innerHTML = `<p class="notif-bell__empty">No notifications yet. Follow topics to get updates.</p>`;
  } else {
    const list = document.createElement("ul");
    list.className = "notif-bell__list";
    notifications.forEach((item) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `bills-policies.html?tab=mine&n=${encodeURIComponent(item.id)}`;
      link.className = `notif-bell__item ${item.read_at ? "" : "is-unread"}`;
      link.innerHTML = `
        <strong>${escapeHtml(item.bill_title || "Bill update")}</strong>
        <span>${escapeHtml(item.matched_topic)} · ${escapeHtml(
          item.action_text || "Updated"
        )}</span>
      `;
      if (item.category === "critical") link.classList.add("is-critical");
      if (item.category === "digest") link.classList.add("is-digest");
      if (item.category === "neighborhood") link.classList.add("is-neighborhood");
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        await markNotificationRead(item.id);
        window.location.href = link.href;
      });
      li.append(link);
      list.append(li);
    });
    panel.append(list);

    const footer = document.createElement("a");
    footer.className = "notif-bell__footer";
    footer.href = "bills-policies.html?tab=mine";
    footer.textContent = "Open feed";
    panel.append(footer);
  }

  bellBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    bellBtn.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", () => {
    panel.hidden = true;
    bellBtn.setAttribute("aria-expanded", "false");
  });
  panel.addEventListener("click", (event) => event.stopPropagation());

  bellWrap.append(bellBtn, panel);

  const userLabel = await getProfileLabel(user);
  const profileBtn = document.createElement("a");
  profileBtn.className = "app-nav__button app-nav__button--ghost";
  profileBtn.href = "profile.html";
  profileBtn.textContent = "Profile";
  profileBtn.title = userLabel;

  const outBtn = document.createElement("button");
  outBtn.type = "button";
  outBtn.className = "app-nav__button app-nav__button--primary";
  outBtn.textContent = "Sign out";
  outBtn.addEventListener("click", () => signOut());

  actions.replaceChildren(bellWrap, profileBtn, outBtn);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function injectSupabaseScript() {
  return new Promise((resolve, reject) => {
    if (window.supabase) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Supabase"));
    document.head.append(script);
  });
}

async function bootNav(activePage) {
  createNavShell(activePage);

  try {
    await injectSupabaseScript();
  } catch (error) {
    console.error(error);
  }

  try {
    await renderAppNav(activePage);
  } catch (error) {
    console.error(error);
    createNavShell(activePage);
  }
}
