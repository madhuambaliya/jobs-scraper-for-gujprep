# OJAS Gujarat Job Scraper

Automated scraper for [OJAS Gujarat](https://ojas.gujarat.gov.in/) recruitment portal.
Runs **twice a week** via GitHub Actions, checks for new government job vacancies, and publishes them to the mobile app's Supabase database.

## How It Works

```
OJAS Portal ──► Playwright scrapes listings
                      │
                      ▼
              Download Notification PDF
                      │
                      ▼
              Upload PDF → Catbox.moe (permanent free URL)
                      │
                      ▼
              Gemini 2.5 Flash AI extraction
              (vacancies, salary, age, fee, location...)
                      │
                      ▼
              Supabase UPSERT (jobs + job_events tables)
```

## Schedule

Runs every **Tuesday and Friday at 9:30 AM IST** (04:00 UTC).

Can also be triggered manually from GitHub Actions tab.

## Required Secrets

Set these in your GitHub repo → **Settings → Secrets → Actions**:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (not anon) |
| `GEMINI_API_KEY` | Google Gemini API key |

## Local Development

```bash
cp .env.example .env
# Fill in your keys in .env

npm install
npx playwright install chromium
npm start
```

## Tech Stack

- **Playwright** — headless browser for ASP.NET postback navigation
- **pdf-parse** — text extraction from downloaded PDFs
- **Gemini 2.5 Flash** — AI-powered structured data extraction
- **Catbox.moe** — free permanent PDF hosting (no account needed)
- **Supabase** — PostgreSQL database backend
