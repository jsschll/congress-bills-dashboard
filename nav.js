async function renderAppNav(activePage = "home") {
  const existing = document.getElementById("app-nav");
  if (existing) existing.remove();

  const nav = document.createElement("nav");
  nav.id = "app-nav";
  nav.className = "app-nav";
  nav.setAttribute("aria-label", "Main");

  const user = await getUser();
  const configured = isSupabaseConfigured();

  let unreadCount = 0;
  let notifications = [];
  if (user) {
    notifications = await fetchNotifications({ limit: 8 });
    unreadCount = notifications.filter((item) => !item.read_at).length;
  }

  nav.innerHTML = `
    <div class="app-nav__inner">
      <a class="app-nav__brand" href="index.html">Congress Bills</a>
      <div class="app-nav__links">
        <a class="app-nav__link ${activePage === "home" ? "is-active" : ""}" href="index.html">Bills</a>
        <a class="app-nav__link ${activePage === "feed" ? "is-active" : ""}" href="feed.html">Feed</a>
        <a class="app-nav__link ${activePage === "topics" ? "is-active" : ""}" href="topics.html">Topics</a>
      </div>
      <div class="app-nav__actions" id="app-nav-actions"></div>
    </div>
  `;

  document.body.prepend(nav);
  const actions = nav.querySelector("#app-nav-actions");

  if (!configured) {
    const hint = document.createElement("span");
    hint.className = "app-nav__hint";
    hint.textContent = "Connect Supabase in config.js";
    actions.append(hint);
    return;
  }

  if (!user) {
    const signIn = document.createElement("a");
    signIn.className = "app-nav__button";
    signIn.href = "auth.html";
    signIn.textContent = "Sign in";
    actions.append(signIn);
    return;
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
      link.href = `feed.html?n=${encodeURIComponent(item.id)}`;
      link.className = `notif-bell__item ${item.read_at ? "" : "is-unread"}`;
      link.innerHTML = `
        <strong>${escapeHtml(item.bill_title || "Bill update")}</strong>
        <span>${escapeHtml(item.matched_topic)} · ${escapeHtml(
          item.action_text || "Updated"
        )}</span>
      `;
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
    footer.href = "feed.html";
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

  const account = document.createElement("div");
  account.className = "app-nav__account";

  const email = document.createElement("span");
  email.className = "app-nav__email";
  email.textContent = user.email || "Signed in";

  const outBtn = document.createElement("button");
  outBtn.type = "button";
  outBtn.className = "app-nav__button app-nav__button--ghost";
  outBtn.textContent = "Sign out";
  outBtn.addEventListener("click", () => signOut());

  account.append(email, outBtn);
  actions.append(bellWrap, account);
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
  try {
    await injectSupabaseScript();
  } catch (error) {
    console.error(error);
  }
  await renderAppNav(activePage);
}
