# Setup

## 1. Supabase
1. Create a project at https://supabase.com
2. Authentication → Providers → Email: enable Email OTP / magic link email
3. SQL Editor: run [`supabase/schema.sql`](supabase/schema.sql)
4. Project Settings → API: copy Project URL and `anon` `public` key

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

Cron runs `/api/watch-bills` every 15 minutes (`vercel.json`).

## 4. Phone signup
Deferred. UI shows phone as “Coming soon” until Twilio is connected in Supabase.
