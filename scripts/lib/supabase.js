const { createClient } = require("@supabase/supabase-js");

function requireSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error(`
Missing credentials. Set both in this terminal:

  $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

Then re-run the script. Never commit the service role key.
`);
    process.exit(1);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = { requireSupabase };
