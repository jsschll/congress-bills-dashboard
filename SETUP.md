# Setup

## 1. Supabase
1. Create a project at https://supabase.com
2. Authentication → Providers → Email:
   - Enable Email provider
   - Enable **Confirm email** (verification link)
3. Authentication → URL Configuration:
   - Site URL: your live site (e.g. `https://jsschll.github.io/congress-bills-dashboard/` or your Vercel URL)
   - Redirect URLs: include `https://YOUR_DOMAIN/auth.html`, `https://YOUR_DOMAIN/auth.html?verified=1`, and `https://YOUR_DOMAIN/auth.html?reset=1`
4. For reliable **email sign-in codes** and password-reset codes, set `RESEND_API_KEY` (+ optional `NOTIFY_FROM_EMAIL`) and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. The app sends codes through `/api/send-auth-code` instead of Supabase’s built-in mailer.
5. SQL Editor: run [`supabase/schema.sql`](supabase/schema.sql)
   - If you already ran an older schema, also run [`supabase/migration-username-auth.sql`](supabase/migration-username-auth.sql)
   - For Bills location filters, also run [`supabase/migration-profile-home-address.sql`](supabase/migration-profile-home-address.sql) (adds `profiles.home_address`)
   - For civic profile preferences, also run [`supabase/migration-profile-civic-prefs.sql`](supabase/migration-profile-civic-prefs.sql)
   - For the civic action tracker, also run [`supabase/migration-civic-actions.sql`](supabase/migration-civic-actions.sql)
   - For voter registration status on Profile, also run [`supabase/migration-voter-registration-status.sql`](supabase/migration-voter-registration-status.sql)
   - For notification delivery categories/email tracking, also run [`supabase/migration-notification-delivery.sql`](supabase/migration-notification-delivery.sql)
   - For Bills, Laws & Policies tables, run [`supabase/migration-bills-policies.sql`](supabase/migration-bills-policies.sql)
6. Project Settings → API: copy Project URL and the **anon / publishable** key

## 2. Local config
Copy `config.example.js` to `config.js` and set:
- `API_KEY` — Congress.gov API key
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3. Vercel env vars
Set these for Production/Preview (Project Settings → Environment Variables, then Redeploy):
- `CONGRESS_API_KEY` — **required for Bills, Laws & Policies and watch-bills cron** (same value as `API_KEY` in `config.js`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (also bake into deployed `config.js`, or replace config at build time)
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to the browser)
- `GEOCODIO_API_KEY` — federal + state legislators (+ school **district names**)
- `CICERO_API_KEY` — recommended for city, county, school board, governors, AGs, mayors, and judges ([Cicero free trial](https://www.cicerodata.com/api/)). The lookup API queries NATIONAL/STATE/LOCAL/COUNTY/SCHOOL/JUDICIAL district types.
- `GOOGLE_CIVIC_API_KEY` — optional for Politicians lookup; **required for live Election & Voting Center** polling places / contests (Representatives API was turned down in April 2025, but Elections + voterinfo still work)
- `OPENSTATES_API_KEY` — state bill feed + optional enrichment for state / municipal officials ([Open States](https://openstates.org/accounts/login/))
- `RESEND_API_KEY` — required for notification **email** delivery and for **auth email codes** / password-reset codes (Forgot password + Sign in with email code). Get a key at [resend.com](https://resend.com)
- `NOTIFY_FROM_EMAIL` — optional verified sender, e.g. `Congress Bills <alerts@yourdomain.com>` (defaults to Resend onboarding sender). Must be allowed by your Resend domain.
- `SITE_URL` — optional canonical site URL used in email links

Cron jobs (`vercel.json`):
- `/api/watch-bills` daily at 00:00 UTC — topic matches, critical floor-vote alerts, neighborhood municipal samples
- `/api/deliver-notifications` daily at 01:30 UTC — emails unsent critical alerts and sends daily/weekly digests per profile prefs

## 4. Politicians feature
1. Run [`supabase/migration-politicians.sql`](supabase/migration-politicians.sql)
2. If you already ran an older politicians migration, also run [`supabase/migration-politicians-levels.sql`](supabase/migration-politicians-levels.sql)
3. Open **Politicians** in the nav, or use the address lookup on the homepage
4. Address lookup merges Geocodio (+ optional Cicero / Google Civic / Open States) and groups results by Federal, State, County, City, School, and Local
5. Federal browse uses Congress.gov current members; other levels appear from address lookups (and are saved for browsing/follow)
6. Signed-in users can Follow / Unfollow individual officeholders (stored in `followed_politicians`)

**Coverage note:** Geocodio alone covers federal and state legislators. City, county, and school board members need a Cicero key (or a still-working Google Civic key). Without those, lookups still return federal/state officials and school **district** names.

## 4b. Profile
1. Run [`supabase/migration-profile-civic-prefs.sql`](supabase/migration-profile-civic-prefs.sql)
2. Open **Profile** in the nav (or click your username)
3. Set street address or ZIP, impact-scale preference, and notification preferences
4. Representation cards resolve from the same lookup API as Politicians
5. Following lists topics, politicians, and bills with unfollow controls
6. Civic action tracker: private bill notes + representative contact log ([`supabase/migration-civic-actions.sql`](supabase/migration-civic-actions.sql))
7. Election & voting center: upcoming elections, polling/early-vote sites, Vote.gov + state links, self-reported registration status, and ballot/hearing cues from followed bills (`/api/voter-info`, [`supabase/migration-voter-registration-status.sql`](supabase/migration-voter-registration-status.sql))
8. Notification delivery: critical floor-vote alerts, daily/weekly digests, and neighborhood municipal alerts respect Profile toggles ([`supabase/migration-notification-delivery.sql`](supabase/migration-notification-delivery.sql)). In-app always; email when `RESEND_API_KEY` is set.

## 5. Auth flow
1. Sign up with username, email, and password
2. User clicks the verification link in email
3. User signs in with email or username + password (or a one-time email code)
4. Nav shows **Sign out** (Sign up is hidden while signed in)

**Important:** Sign-in codes, magic links, and password-reset links are only issued for emails that already have a real signup (`profiles.username` set). Requesting a code for an unknown email must not create an Auth user or empty profile.

## 6. Phone signup
Deferred. Can be added later with Twilio in Supabase.
