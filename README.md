# Tennis Marker

A courtside recorder for *where* and *how* a player loses points. Tap the half court where she
was when the point ended, then tap one of six buttons (forehand / backhand × long / net / wide),
optionally flag it as forced. Patterns show up live on the court, in the in-place Stats view, and on the Dashboard.

**Live app:** https://rokey-z.github.io/tennis-marker/ — works on phone and desktop, installable
as a home-screen app, records offline.

## How to use it courtside

1. **Sessions → Practice / Match** creates a session and opens the court.
2. **Tap the court** where she lost the point → a small menu pops up right at your finger → tap
   **FH/BH × Long/Net/Wide**. That's 2 taps per point. Toggle **Forced** on the menu only when
   needed (it resets each point). Tap anywhere else on the court to cancel.
3. **Undo** removes the last point; the **Log** panel at the bottom lists every point (newest first)
   and lets you delete any of them.
4. **Near end / Far end** flips the court 180° so you can tap what you physically see when she's on
   the far side. Data is always stored from *her* point of view (net at top, deuce side right).
5. **Dashboard** is the analysis view: KPI tiles with sparklines and a trend delta, auto-generated
   "what stands out" insights, an **errors-per-session** chart over time (stack by stroke / error
   type / forced, 3-session average, click a column to drill in, table view), a **session
   timeline** (point-by-point strip with quiet-gap markers, when-in-the-session buckets, longest
   run, thirds), error mix by stroke, match vs practice, the zone heatmap, and a chronological
   **timeline** of every session. Filters (date range, match/practice) scope the whole page.
6. **Stats** (button on the record screen) flips the same court into the 3×3 zone heatmap with every
   point drawn (Ad side | Middle | Deuce side × Net | Mid-court | Baseline), with stroke / error /
   forced filters, and shows the tiles, "where the ball went" bars, the FH/BH × long/net/wide matrix
   and CSV / JSON export below — no page change. Tap **Court** to go back to recording.
7. Tap the session title to rename it, set the date/type, add notes, or delete it.

Tip: install it (iPhone: Share → *Add to Home Screen*; Android/desktop Chrome: *Install app*).
Installed apps open full-screen and keep local data longer.

## How data works

- **Local-first.** Everything is saved in the browser immediately (`localStorage`), so recording
  works with no signal. Nothing ever waits on the network.
- **Cloud sync (optional).** With Supabase configured and a sign-in, a small sync engine uploads
  changes in the background and pulls the latest on start/focus, so phone and desktop show the
  same data. Rows are soft-deleted; merges are tombstone-wins, then last-write-wins by `updated_at`.
- **Without Supabase** the app runs in *local-only* mode (the badge says "Local only"). Use
  **Settings → Backup (JSON)** to move data between devices by file.
- Coordinates are stored in **court feet** in the player's frame (`x`: 0 = center line, + = deuce
  side; `y`: 0 = net, 39 = baseline, up to 51). The zone grid is derived at read time from
  constants in `src/domain/court.ts`, so it can be re-tuned later without touching stored data.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/tennis-marker/
npm test           # vitest (domain + data layer + sync engine)
npm run build      # tsc + vite build (+ PWA service worker)
npm run preview    # serve dist/ to test the installed/offline behaviour
```

Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to
develop against your Supabase project; leave them empty for local-only mode.

Layout:

```
src/domain/   types, court geometry + zones, stats aggregation, analytics (trend/timeline/insights), CSV/JSON export   (pure, tested)
src/data/     localRepo (persistence + merge), store (state + actions), syncEngine, supabaseClient, auth
src/components/  Court (SVG, tap→feet, flip, markers, heat), ShotSheet, Shell, charts (stacked columns, sparkline, sequence strip, share bars), small bits
src/pages/    Sessions, Record (court + in-place stats), Dashboard, Settings
supabase/migrations/0001_init.sql   tables + RLS policies
.github/workflows/deploy.yml        test → build → GitHub Pages
```

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds (with the two
`VITE_SUPABASE_*` repository secrets, if set) and publishes `dist/` to GitHub Pages. Vite's `base`
is `/tennis-marker/`; routing is hash-based so deep links survive refreshes on Pages.

## Turning on cloud sync (one-time, ~10 minutes)

The build is fully functional without this; do it when you want phone ↔ desktop sync.

1. **Create a Supabase project** at https://supabase.com/dashboard (free tier is fine).
2. **Create the tables:** Dashboard → *SQL Editor* → paste `supabase/migrations/0001_init.sql` → Run.
   (Or with the CLI: `supabase link` then `supabase db push`.)
3. **Create your user:** *Authentication → Users → Add user* (email + password, "auto confirm").
   Then *Authentication → Sign In / Providers → Email* → turn **off** "Allow new users to sign up".
   The app only has a sign-in form; the same account is used on every device.
4. **Get the keys:** *Project Settings → API* → copy the **Project URL** and the **publishable**
   (or legacy `anon`) key. These are public-by-design; Row Level Security is what protects the data.
5. **Add them as repository secrets** (from a terminal in this repo):
   ```bash
   gh secret set VITE_SUPABASE_URL --body "https://xxxx.supabase.co"
   gh secret set VITE_SUPABASE_ANON_KEY --body "sb_publishable_..."
   ```
   then re-run the deploy: `gh workflow run Deploy` (or push any commit).
6. Open the app → *Settings* → sign in. Local sessions recorded before signing in are uploaded
   automatically.

Optional: `gh variable set KEEPALIVE_ENABLED --body true` enables `keepalive.yml`, which pings the
project every two days so the free tier doesn't pause. If a free project does pause, recording still
works (local-first); restore it from the Supabase dashboard and sync resumes.

## Not in v1 (ideas)

Points won / winners (to get rates, not just counts), double faults, score tracking, more stroke
types (volley / overhead — the `stroke` column is free-form), a read-only share link, multiple players.
