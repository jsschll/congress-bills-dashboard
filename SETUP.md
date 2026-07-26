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
- `GEOCODIO_API_KEY` — federal + state legislators (+ school **district names**)
- `CICERO_API_KEY` — recommended for city, county, and school **board members** ([Cicero free trial](https://www.cicerodata.com/api/))
- `GOOGLE_CIVIC_API_KEY` — optional; Google’s Representatives API was turned down in April 2025, but still tried when set
- `OPENSTATES_API_KEY` — optional enrichment for state / some municipal officials ([Open States](https://openstates.org/accounts/login/))

Cron runs `/api/watch-bills` once daily at midnight UTC (`vercel.json`).

## 4. Politicians feature
1. Run [`supabase/migration-politicians.sql`](supabase/migration-politicians.sql)
2. If you already ran an older politicians migration, also run [`supabase/migration-politicians-levels.sql`](supabase/migration-politicians-levels.sql)
3. Open **Politicians** in the nav, or use the address lookup on the homepage
4. Address lookup merges Geocodio (+ optional Cicero / Google Civic / Open States) and groups results by Federal, State, County, City, School, and Local
5. Federal browse uses Congress.gov current members; other levels appear from address lookups (and are saved for browsing/follow)
6. Signed-in users can Follow / Unfollow individual officeholders (stored in `followed_politicians`)

**Coverage note:** Geocodio alone covers federal and state legislators. City, county, and school board members need a Cicero key (or a still-working Google Civic key). Without those, lookups still return federal/state officials and school **district** names.

## 5. Auth flow
1. Sign up with username, email, and password
2. User clicks the verification link in email
3. User signs in with email or username + password
4. Nav shows **Sign out** (Sign up is hidden while signed in)

## 6. Phone signup
Deferred. Can be added later with Twilio in Supabase.
