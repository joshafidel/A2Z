# A2Z — browser-only travel planning assistant

A2Z helps you plan door-to-door travel: create trips, watch a living
timeline, get a deterministic "leave by" estimate for the airport, build a
packing list, compare transportation options with your own numbers, and check
destination weather — all in the browser, with **no account and no server**.

Built with **React Native + Expo + TypeScript**, exported as a **static
website**. Live site: **https://joshafidel.github.io/A2Z/**

## What this version does

- **Create trips by hand** — name, cities, airports, dates, flight, hotel,
  and how you're getting to the airport. Everything is labeled *Entered by
  you*. Trips can be **edited, duplicated, and deleted** (with confirmation).
- **Plan trips interactively** — the guided interview flow (where / when /
  how / ticket / stay / first-last mile) saves to the same trip list.
- **Living timeline** — packing, online check-in, bag-drop cutoff, boarding,
  leave-home, hotel check-in/out; statuses (done / now / next / changed) come
  from your browser clock. Add your own items, hide generated ones
  (restorable), and mark anything done by hand.
- **Airport departure calculator** — deterministic and itemized: 120 min
  domestic / 180 min international base lead (never below 75 / 120), +20 min
  checked bag, −15 TSA PreCheck, −5 CLEAR, your own buffers from Settings,
  plus an uncertainty buffer. Changing an assumption shows the old → new
  leave time. Always labeled an estimate.
- **Manual flight status** — you type what your airline app shows (delayed,
  cancelled, estimated departure, gate, terminal); A2Z recalculates the plan
  and records what changed. *This is not live flight tracking* — the app
  says so on the card.
- **Destination weather** — Open-Meteo (keyless, CORS-friendly, called from
  your browser) with a "last checked" time and a manual refresh button. When
  no forecast is available (too far out, offline), you pick expected
  conditions (hot / mild / cold / rainy / snowy / mixed) and packing advice
  uses that instead — labeled as your estimate. The rest of the trip keeps
  working either way.
- **Packing list** — rule-based suggestions from trip length, purpose, bag
  situation, and weather. Check off, add, remove, and regenerate — your own
  items and packed state survive regeneration.
- **Transportation comparison** — enter the options you're weighing
  (rideshare, transit, driving…) with your own durations and prices; A2Z
  marks cheapest / fastest / recommended using a transparent 50/50
  price-time score (re-weighted by your Settings priority) and explains why
  in plain English.
- **Recommendations** — deterministic rules: rain warning, passport
  reminder, tight airport buffer, hotel check-in gap, missing return date,
  long airport run. Accepting applies a small local effect (packing item or
  timeline reminder); dismissed advice can be restored.
- **Review center (approvals)** — money decisions wait for you. "Continue
  with provider" opens the provider's website in a new tab, and the app then
  says it **cannot confirm whether the booking was completed**. Nothing is
  ever marked "booked."
- **What changed** — a per-trip history of meaningful changes with old and
  new values ("Departure changed from 6:05 PM to 6:42 PM. Your recommended
  leave time changed from 3:34 PM to 4:11 PM.").
- **Demo trip** — a seeded example labeled **Demo data** on every card; copy
  it into your own trips (the copy drops the demo label) or delete it
  without a trace.
- **Export / import / reset** — download everything as one versioned JSON
  file, import it in another browser (validated first), or wipe all data
  (with confirmation).

## What this version does NOT do

These need a backend, a database, or commercial agreements — they are not
"switched off," they are impossible in a static site, and the app says so in
Settings:

- No flight monitoring while the page is closed, and no push/email alerts.
- No accounts, no login, no cross-device sync — data lives in **this
  browser on this device**.
- No email or calendar import (needs OAuth and a server).
- No in-app booking or payments — provider links open in a new tab; A2Z
  never completes or confirms a purchase.
- No secret API keys. Optional `EXPO_PUBLIC_*` keys (Google Routes,
  Anthropic, aviationstack, TSA, Amadeus) enhance planning data, but nothing
  requires them and they are visible to visitors by nature — see
  [SETUP_REAL_DATA.md](./SETUP_REAL_DATA.md).

## Local setup

```bash
npm install
npm start            # Expo dev server → press w for web
```

## Commands

```bash
npm run typecheck    # strict TypeScript, no emit
npm test             # Jest — 140 unit tests
npm run build        # static export to dist/ (+ PWA tags)
```

## Deployment (static)

`npm run build` produces `dist/` — any static host works.

- **GitHub Pages (current)**: pushing to the working branch runs
  `.github/workflows/deploy-web.yml` (test → build with the `/A2Z` base path
  → publish). No dashboard setup.
- **Vercel**: import the repo; `vercel.json` already sets build `npm run
  build`, output `dist`. No server functions are required — the optional
  `api/flight-status.js` proxy only matters if you add its env key.
- Anywhere else: upload `dist/` (set `EXPO_BASE_URL=/subpath` when not at
  the domain root).

## Browser storage

Everything lives under `@a2z/*` keys in `localStorage` (via AsyncStorage):
trips (`@a2z/saved-trips`), the traveler profile, packing lists, approvals,
notifications, timeline edits, transport options, weather snapshots, advice
decisions, and the audit log. Corrupted or missing values fall back to safe
defaults — a bad blob never crashes the app. Nothing sensitive belongs here:
A2Z never asks for passport numbers, payment cards, or passwords.

- **Export**: Settings → *Your data* → **Export data** downloads one
  versioned JSON document.
- **Import**: Settings → **Import data** — paste the file's contents; the
  document is validated (app marker, version, per-key JSON, trip shape)
  before anything is written, then replaces this browser's data.
- **Reset**: Settings → **Reset all data** — asks first; irreversible.

## Weather behavior

Open-Meteo needs no key and allows browser calls. The weather card shows
**LIVE** only when a real response arrived, with when it was last checked. A
failed refresh keeps the previous snapshot and marks it "may be out of
date" — it never pretends stale data is current. Dates beyond the 16-day
window show an honest unavailable state plus the manual expected-conditions
picker. Unit tests never call the real API.

## Security limitations (static site)

- Everything shipped to the browser is public — hence no secret keys, no
  fake login, and no pretend integrations.
- `EXPO_PUBLIC_*` keys are visible to visitors; only use keys that are safe
  to expose and restrict them by referrer/quota.
- Your data is only as private as the browser profile it is stored in;
  export regularly if you care about it.

## Roadmap

**Current static prototype** — local trip creation and editing, browser
storage with export/import/reset, editable living timeline, departure
calculator, weather with honest fallback, packing suggestions,
transportation comparison, provider links, local approvals, what-changed
history, labeled demo mode.

**Future backend version** — user accounts, cross-device sync, email and
calendar import, secure flight-status API, background monitoring, push and
email notifications, OAuth connections, commercial booking integrations,
payment handling.

## Architecture notes

Every screen talks to services returning `ServiceResult<T>`
(`{ ok, data } | { ok: false, error, code }`), so live providers and honest
fallbacks swap behind the same interfaces. The departure engine, advice
rules, transport scoring, timeline derivation, and import validation are
pure TypeScript functions covered by the test suite
(`__tests__/clientPrototype.test.ts`, `travelOs.test.ts`,
`departureService.test.ts`, and friends).
