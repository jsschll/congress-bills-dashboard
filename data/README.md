# Judge data — published to cloud Supabase

## Full Texas load (mapping + high courts) — do this first

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
- **Statewide** (Supreme Court, Court of Criminal Appeals, Governor)  
- **Appellate** chief justices for Courts of Appeals 1–14 (+ some 14th Court justices)

What it does **not** wipe: your existing **District** / **County/Magistrate** rows (e.g. Fort Bend).

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
