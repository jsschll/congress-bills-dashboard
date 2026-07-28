# Judge / official data — published to cloud Supabase

## Run order (SQL Editor)

1. [`../supabase/migration-selection-method-and-legislative.sql`](../supabase/migration-selection-method-and-legislative.sql) — adds `party`, `photo_url`, `selection_method`, `appointed_by`, and `Legislative` level  
2. [`../supabase/seed-state-executives.sql`](../supabase/seed-state-executives.sql) — 50-state Executive Branch  
3. [`../supabase/seed-state-legislators/`](../supabase/seed-state-legislators/) — run `01` … `05` in order (~7,359 senators / representatives / assembly members)
4. [`../supabase/migration-local-officials.sql`](../supabase/migration-local-officials.sql) — creates `local_officials` for mayors / future municipal officials
5. [`../supabase/seed-local-mayors-top100.sql`](../supabase/seed-local-mayors-top100.sql) — top 100 U.S. cities mayor seed

Confirm:

```sql
select court_or_agency, selection_method, count(*)
from state_officials
group by 1, 2
order by 1, 2;

select count(*) from state_officials where court_or_agency = 'Legislative Branch';
-- expect ~7350+
```

---

## All 50 states — Executive Branch

File: [`../supabase/seed-state-executives.sql`](../supabase/seed-state-executives.sql)

Seeds **Governor, Lieutenant Governor, Attorney General, Secretary of State, and Treasurer** (or treasury equivalent) for every state, with **name, title, party, photo**, plus **Elected** or **Appointed by …**.

UI: State tab → **Executive Branch**.

Notes:
- A few states have no Lt. Governor (AZ, ME, NH, OR, WY) or no Treasurer (AK, HI).
- Appointed officers show `Appointed by Governor` (or Legislature / etc.) on the card.

Regenerate (optional):
```powershell
node scripts/generate-state-executives-seed.js
node scripts/json-to-state-executives-sql.js
```

---

## All 50 states — Legislature / Representatives

Folder: [`../supabase/seed-state-legislators/`](../supabase/seed-state-legislators/)

Source: [Open States](https://data.openstates.org/people/current/) current legislator CSVs.

Each row includes title, name, photo, party, district, and `selection_method = elected`.

UI: State tab → **Legislature / Representatives** (filtered to the address’s senate + house/assembly districts via Geocodio).

Regenerate:
```powershell
node scripts/generate-state-legislators-seed.js
```

---

## Full Texas load (mapping + high courts)

File: [`../supabase/seed-tx-all-mapping-and-high-courts.sql`](../supabase/seed-tx-all-mapping-and-high-courts.sql)

1. Open Supabase → **SQL Editor** → New query  
2. Open that `.sql` file in Cursor, **Select All → Copy**  
3. Paste into Supabase SQL Editor → **Run**  
4. Confirm:

```sql
select count(*) from county_district_mapping where state_code = 'TX';
-- expect 254

select level, count(*) from state_officials where state_code = 'TX' group by level order by 1;
```

What it loads:
- **All 254 TX counties** → appellate + judicial district numbers  
- **Statewide** (Supreme Court, Court of Criminal Appeals)  
- **Appellate** chief justices for Courts of Appeals 1–14 (+ some 14th Court justices)

What it does **not** wipe: your existing **District** / **County/Magistrate** rows (e.g. Fort Bend). Prefer running the **Executive Branch** seed separately (above) for governors/AGs.

---

## Top 100 U.S. cities — Mayors

Files:
- [`../supabase/migration-local-officials.sql`](../supabase/migration-local-officials.sql)
- [`../supabase/seed-local-mayors-top100.sql`](../supabase/seed-local-mayors-top100.sql)
- [`./us-top-cities-top100.json`](./us-top-cities-top100.json)
- [`./local-mayors-top100.json`](./local-mayors-top100.json)
- [`./local-mayors-top100-coverage.md`](./local-mayors-top100-coverage.md)

What it loads:
- A dedicated `local_officials` table for municipal records
- Mayor rows for the **top 100 U.S. cities by 2025 population**
- Provenance, website URL, government type, and term-year metadata where available

Regenerate:
```powershell
node scripts/generate-local-mayors-seed.js
```

UI:
- City/place searches can now prefer a seeded mayor from `local_officials`
- Mayor records render under **City / Municipal** on the results page

Confirm:
```sql
select count(*) from public.local_officials where title = 'Mayor';
-- expect 100

select state_code, city_name, full_name
from public.local_officials
where title = 'Mayor'
order by state_code, city_name
limit 20;
```

---

The live site already reads from **cloud Supabase**. Publishing means loading
CSVs from this repo into that database (not keeping anything only on your laptop).

## Preferred: publish via Vercel API

### One-time setup (Vercel)
1. Vercel project → **Settings** → **Environment Variables**
2. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role secret — not the anon key)
   - `JUDGES_IMPORT_SECRET` (any long random string you invent)
3. Redeploy so env vars apply

### Publish after you change CSVs
1. Edit files under `data/` (e.g. add another county’s judges)
2. Commit + push to `main` (site/repo update)
3. Call the publish endpoint (PowerShell):

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://congress-bills-dashboard.vercel.app/api/publish-judges" `
  -Headers @{ Authorization = "Bearer YOUR_JUDGES_IMPORT_SECRET" }
```

Friends hard-refresh and search — they hit the same cloud DB.

## Files to edit

| Path | Purpose |
|------|---------|
| `state-executives.json` | Generated 50-state executive roster |
| `tx-county-mapping.csv` | County → appellate/judicial districts |
| `tx-statewide.csv` | Statewide courts / leadership |
| `tx-appellate.csv` | Courts of Appeals |
| `tx-local.csv` | District + County/Magistrate |

### Mapping columns
```text
state_code,county_name,appellate_district_numbers,judicial_district_numbers
TX,Fort Bend,"1|14","240|268|328|387|434|458"
```

### Officials columns
```text
full_name,title,level,state_code,district_number,county_name
Steve Rogers,Judge 268th District Court,District,TX,268,Fort Bend
```

`level`: `Statewide` | `Appellate` | `District` | `County/Magistrate`

## Friend-testing loop
1. Add their county to the CSVs  
2. Push to `main`  
3. POST `/api/publish-judges` with your secret  
4. They refresh and search  

## Optional local debug
```powershell
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
node scripts/import-all-judges.js
```
