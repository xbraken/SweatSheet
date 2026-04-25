# SweatSheet

Workout tracker that puts everything in one place. Runs auto-import from Strava, lifting sessions are logged manually, and all of it is available in one feed with actual charts and stats.

Built this because my workout data was scattered across Zepp, Apple Watch, and the Notes app. None of it talked to each other.

## What it does

- **Set tracking** — log exercises, weights, reps as you go. Rest timer between sets, kg/lb toggle, session and per-block notes.
- **Routines** — save reusable workout templates and start a session from one in a tap.
- **Strava sync** — connect your Strava account and runs/rides import automatically via webhooks. HR, pace, and distance charts included.
- **AI screenshot parsing** — take a screenshot of a workout from another app and it'll extract the data using Claude's vision API.
- **Progress charts** — five lift metrics (max weight, volume, estimated 1RM, reps at max, avg weight), cardio pace/distance trends, race PRs, bodyweight tracking. PR markers on the chart so you can see where you broke records.
- **Body heatmap** — visual silhouette showing which muscle groups you've trained over the past week or month, including secondary-muscle credit (push-ups light up your core too). Tap a region to see which exercises contributed.
- **Social** — follow friends, see their workouts, profile pics in the nav.
- **PWA** — install it on your phone from the browser.

## Stack

- Next.js 15 (App Router)
- Tailwind CSS
- Turso (cloud SQLite via libsql)
- Claude Haiku for vision parsing
- Deployed on Vercel

## Running locally

```bash
git clone https://github.com/xbraken/SweatSheet.git
cd SweatSheet
npm install
npm run dev
```

Needs a `.env` file:

```
TURSO_DATABASE_URL=your-turso-url
TURSO_AUTH_TOKEN=your-turso-token
ANTHROPIC_API_KEY=your-api-key
JWT_SECRET=some-secret-string

# Optional — for Strava auto-import
STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret
STRAVA_WEBHOOK_VERIFY_TOKEN=any-string-you-choose
```

## Data model

```
sessions → blocks → sets     (lifting)
                  → cardio   (runs, cycling)
```

A session is a single workout day. Blocks are ordered sections within a session — either a lift block (with sets) or a cardio block (with distance/duration/HR data).

## Backups

A GitHub Actions workflow (`.github/workflows/backup.yml`) dumps the Turso database daily at 03:00 UTC and uploads the gzipped SQL as a 90-day artifact. Restore with:

```bash
gunzip sweatsheet-YYYY-MM-DD.sql.gz
turso db shell <db-name> < sweatsheet-YYYY-MM-DD.sql
```

Requires `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as repo secrets.
