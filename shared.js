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
