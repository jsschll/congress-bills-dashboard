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

function syncHeaderAuth(user, profile = null) {
  const headerActions = document.querySelector(".header__actions");
  if (!headerActions) return;

  const refreshBtn = headerActions.querySelector("#refresh-btn");
  headerActions.replaceChildren();

  if (user) {
    const menu = buildUserMenuControl(user, profile, {
      compact: true,
      onSignOut: () => signOut(),
    });
    headerActions.append(menu);
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
        <span class="app-nav__brand-text">Article 1</span>
      </a>
      <div class="app-nav__links">
        ${link("home", "index.html", "Home")}
        ${link("search", "search.html", "Legislation")}
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

async function getNavProfile(user) {
  const client = getSupabase();
  if (!client || !user) {
    return {
      username: "",
      email: user?.email || "",
      display_name: "",
      avatar_url: "",
    };
  }

  const { data, error } = await client
    .from("profiles")
    .select("username, email, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Older DBs may not have avatar columns yet.
    const fallback = await client
      .from("profiles")
      .select("username, email")
      .eq("id", user.id)
      .maybeSingle();
    return {
      username: fallback.data?.username || "",
      email: fallback.data?.email || user.email || "",
      display_name: "",
      avatar_url: "",
    };
  }

  return {
    username: data?.username || "",
    email: data?.email || user.email || "",
    display_name: data?.display_name || "",
    avatar_url: data?.avatar_url || "",
  };
}

function buildUserMenuControl(user, profile, { onSignOut, compact = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "user-menu";

  const firstName = profileFirstName(profile, user);
  const label =
    profile.display_name ||
    profile.username ||
    profile.email ||
    user?.email ||
    "Account";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "user-menu__trigger";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", `Account menu for ${firstName}`);

  const avatar = document.createElement("span");
  avatar.className = "user-avatar user-avatar--nav";
  applyAvatarElement(avatar, {
    avatarUrl: profile.avatar_url,
    label: label,
  });

  const name = document.createElement("span");
  name.className = "user-menu__name";
  name.textContent = firstName;

  const caret = document.createElement("span");
  caret.className = "user-menu__caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "▾";

  trigger.append(avatar, name, caret);

  const panel = document.createElement("div");
  panel.className = "user-menu__panel";
  panel.setAttribute("role", "menu");
  panel.hidden = true;

  const mkItem = (tag, { href, text, danger = false, onClick } = {}) => {
    const item = document.createElement(tag);
    item.className = `user-menu__item${danger ? " user-menu__item--danger" : ""}`;
    item.setAttribute("role", "menuitem");
    item.textContent = text;
    if (href) item.href = href;
    if (onClick) {
      item.type = "button";
      item.addEventListener("click", onClick);
    }
    return item;
  };

  panel.append(
    mkItem("a", { href: "politicians.html?following=1", text: "Following" }),
    mkItem("a", { href: "profile.html#account", text: "Settings" }),
    mkItem("a", { href: "profile.html", text: "Profile" }),
    mkItem("button", {
      text: "Sign out",
      danger: true,
      onClick: () => {
        if (typeof onSignOut === "function") onSignOut();
        else signOut();
      },
    })
  );

  const openMenu = () => {
    clearCloseTimer();
    document.querySelectorAll(".notif-bell__panel").forEach((el) => {
      el.hidden = true;
    });
    document.querySelectorAll(".notif-bell__button").forEach((el) => {
      el.setAttribute("aria-expanded", "false");
    });
    wrap.classList.add("is-open");
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };

  const closeMenu = () => {
    clearCloseTimer();
    wrap.classList.remove("is-open");
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  let closeTimer = null;
  const clearCloseTimer = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer = setTimeout(closeMenu, 150);
  };

  // Desktop hover: open while pointer is over the control, close on leave.
  wrap.addEventListener("mouseenter", openMenu);
  wrap.addEventListener("mouseleave", scheduleClose);

  // Touch / keyboard fallback.
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (wrap.classList.contains("is-open")) closeMenu();
    else openMenu();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu();
      panel.querySelector(".user-menu__item")?.focus?.();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target)) closeMenu();
  });

  wrap.append(trigger, panel);
  if (compact) wrap.classList.add("user-menu--compact");
  return wrap;
}

function buildNotificationBell(notifications, unreadCount) {
  const bellWrap = document.createElement("div");
  bellWrap.className = "notif-bell";

  const bellBtn = document.createElement("button");
  bellBtn.type = "button";
  bellBtn.className = "notif-bell__button";
  bellBtn.setAttribute("aria-label", "Notifications");
  bellBtn.setAttribute("aria-expanded", "false");
  bellBtn.innerHTML = `
    <span class="notif-bell__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M12 3a5 5 0 0 0-5 5v2.1c0 .7-.2 1.4-.6 2L5.2 14.5A1 1 0 0 0 6 16h12a1 1 0 0 0 .8-1.5L17.6 12.1c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M10 17a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </span>
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
    document.querySelectorAll(".user-menu__panel").forEach((el) => {
      el.hidden = true;
    });
    document.querySelectorAll(".user-menu").forEach((el) => {
      el.classList.remove("is-open");
    });
    document.querySelectorAll(".user-menu__trigger").forEach((el) => {
      el.setAttribute("aria-expanded", "false");
    });
    panel.hidden = !open;
    bellBtn.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", () => {
    panel.hidden = true;
    bellBtn.setAttribute("aria-expanded", "false");
  });
  panel.addEventListener("click", (event) => event.stopPropagation());

  bellWrap.append(bellBtn, panel);
  return bellWrap;
}

async function renderAppNav(activePage = "home") {
  const { actions } = createNavShell(activePage);

  let user = null;
  try {
    user = await getUser();
  } catch (error) {
    console.error(error);
  }

  if (!user) {
    syncHeaderAuth(null);
    buildLoggedOutActions(actions);
    if (!isSupabaseConfigured()) {
      const hint = document.createElement("span");
      hint.className = "app-nav__hint";
      hint.textContent = "Add SUPABASE_ANON_KEY in config.js";
      actions.prepend(hint);
    }
    return;
  }

  const profile = await getNavProfile(user);
  syncHeaderAuth(user, profile);

  let unreadCount = 0;
  let notifications = [];
  try {
    notifications = await fetchNotifications({ limit: 8 });
    unreadCount = notifications.filter((item) => !item.read_at).length;
  } catch (error) {
    console.error(error);
  }

  const bellWrap = buildNotificationBell(notifications, unreadCount);
  const userMenu = buildUserMenuControl(user, profile, {
    onSignOut: () => signOut(),
  });

  actions.replaceChildren(bellWrap, userMenu);
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
