let supabaseClient = null;

function isSupabaseConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("YOUR_SUPABASE") &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  );
}

function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (supabaseClient) return supabaseClient;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase JS library is not loaded.");
    return null;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

async function getSession() {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error(error);
    return null;
  }
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

async function requireUser(redirectTo = "auth.html") {
  const user = await getUser();
  if (!user) {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`
    );
    window.location.href = `${redirectTo}?next=${next}`;
    return null;
  }
  return user;
}

async function signOut() {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut();
  window.location.href = "index.html";
}

async function countFollows(userId) {
  const client = getSupabase();
  if (!client) return 0;
  const { count, error } = await client
    .from("followed_topics")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error(error);
    return 0;
  }
  return count || 0;
}

async function fetchNotifications({ limit = 20, unreadOnly = false } = {}) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) return [];

  let query = client
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

async function markNotificationRead(notificationId) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) return;

  await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);
}

function congressGovBillUrl(notification) {
  const type = String(notification.bill_type || "").toLowerCase();
  const number = notification.bill_number;
  const congress = notification.bill_congress || 119;
  if (!type || !number) return "https://www.congress.gov/";
  return `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`;
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const AVATAR_PRESETS = [
  { id: "slate", label: "Slate", from: "#334155", to: "#0f172a" },
  { id: "emerald", label: "Emerald", from: "#059669", to: "#064e3b" },
  { id: "ocean", label: "Ocean", from: "#2563eb", to: "#1e3a8a" },
  { id: "amber", label: "Amber", from: "#d97706", to: "#78350f" },
  { id: "rose", label: "Rose", from: "#e11d48", to: "#881337" },
  { id: "violet", label: "Violet", from: "#7c3aed", to: "#4c1d95" },
];

function avatarPresetId(avatarUrl = "") {
  const match = String(avatarUrl || "").match(/^preset:([a-z0-9_-]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function findAvatarPreset(id) {
  return AVATAR_PRESETS.find((preset) => preset.id === id) || null;
}

function profileInitials(label = "") {
  const parts = String(label || "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function profileFirstName(profile = {}, user = null) {
  const display = String(profile.display_name || "").trim();
  if (display) return display.split(/\s+/)[0];
  const username = String(profile.username || "").trim();
  if (username) return username;
  const email = String(profile.email || user?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "Account";
}

function resolveAvatarUrl(avatarUrl = "") {
  const value = String(avatarUrl || "").trim();
  if (!value) return "";
  if (/^preset:/i.test(value)) return "";
  return value;
}

function applyAvatarElement(el, { avatarUrl = "", label = "" } = {}) {
  if (!el) return;
  const presetId = avatarPresetId(avatarUrl);
  const preset = findAvatarPreset(presetId);
  const imageUrl = resolveAvatarUrl(avatarUrl);
  const initials = profileInitials(label);

  el.classList.add("user-avatar");
  el.replaceChildren();

  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "user-avatar__img";
    img.src = imageUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      el.replaceChildren();
      el.style.background = "linear-gradient(135deg, #334155, #0f172a)";
      el.textContent = initials;
      el.removeAttribute("data-avatar-image");
    });
    el.style.background = "";
    el.dataset.avatarImage = "1";
    el.append(img);
    return;
  }

  el.removeAttribute("data-avatar-image");
  if (preset) {
    el.style.background = `linear-gradient(135deg, ${preset.from}, ${preset.to})`;
  } else {
    el.style.background = "linear-gradient(135deg, #334155, #0f172a)";
  }
  el.textContent = initials;
}

async function compressImageFile(file, { maxSize = 256, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Could not process image.");
  return blob;
}

async function uploadProfileAvatar(userId, file) {
  const client = getSupabase();
  if (!client || !userId) throw new Error("Not signed in.");
  const blob = await compressImageFile(file);
  const path = `${userId}/avatar.jpg`;

  try {
    const { error } = await client.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) throw error;
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error("Missing public avatar URL.");
    return `${publicUrl}?v=${Date.now()}`;
  } catch (error) {
    // Fallback when storage bucket/policies are not configured yet.
    console.warn("Avatar storage upload failed; using inline image.", error);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl || dataUrl.length > 180000) {
      throw new Error(
        "Image is too large to save without Storage. Run migration-profile-avatar.sql in Supabase, then try again."
      );
    }
    return dataUrl;
  }
}

