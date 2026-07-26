# Setup

## 1. Supabase
1. Create a project at https://supabase.com
2. Authentication → Providers → Email:
   - Enable Email provider
   - Enable **Confirm email** (verification link)
   - Disable magic link / OTP if you only want password auth
3. Authentication → URL Configuration:
   - Site URL: your live site (e.g. `https://jsschll.github.io/congress-bills-dashboard/` or your Vercel URL)
   - Redirect URLs: include `https://YOUR_DOMAIN/auth.html` and `https://YOUR_DOMAIN/auth.html?verified=1`
4. SQL Editor: run [`supabase/schema.sql`](supabase/schema.sql)
   - If you already ran an older schema, also run [`supabase/migration-username-auth.sql`](supabase/migration-username-auth.sql)
5. Project Settings → API: copy Project URL and the **anon / publishable** key

## 2. Local config
Copy `config.example.js` to `config.js` and set:
- `API_KEY` — Congress.gov API key
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3. Vercel env vars
Set these for Production/Preview:
- `CONGRESS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (also bake into deployed `config.js`, or replace config at build time)
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to the browser)

Cron runs `/api/watch-bills` once daily at midnight UTC (`vercel.json`).

## 4. Auth flow
1. Sign up with username, email, and password
2. User clicks the verification link in email
3. User signs in with email or username + password
4. Nav shows **Sign out** (Sign up is hidden while signed in)

## 5. Phone signup
Deferred. Can be added later with Twilio in Supabase.
