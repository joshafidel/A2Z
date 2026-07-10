# A2Z — door-to-door travel planning

A2Z is an "everything you need to know before and during travel" assistant. Enter where you're starting, where you're going, and what matters to you — A2Z compares **flights, trains, buses, driving, rideshares, walking, and transit**, then produces a clear door-to-door plan: when to leave, every step on a timeline, honest all-in pricing (including the hidden costs), weather-aware advice, airport intelligence, and backup plans.

Built with **React Native + Expo + TypeScript**. All external data comes from a **mock API layer** designed so real providers can be dropped in behind the same interfaces.

## Screens

A2Z is **not a search engine** — it interviews you and curates the plan:

| Screen / step | What it does |
| --- | --- |
| **Start page** | One action: *Plan a trip*. Shows your next saved trip and what A2Z does. No forms, no clutter. |
| **Where from / where to** | Autocomplete as you type — "loga" surfaces *Logan International Airport (BOS)* instantly (alias + code aware), with live geocoder addresses merged in. A saved **Home** chip (star any address to save it), current location, and an **"I need a hotel there"** checkbox. No random suggestions. |
| **When** | A real **month calendar** to pick the date, optional morning/midday/night window, travelers & bags. |
| **How** | Mode cards showing **cheapest / average / priciest** price and **fastest / typical / slowest** door-to-door time per mode. |
| **Pick your ticket** | Only the chosen mode's departures for your date — several per service, **Recommended** option pinned first (best mix of price, speed, timing). |
| **Pick your stay** | Appears right after the ticket when the hotel box was checked — "What's the occasion?" re-ranks stays (convention-district first for work trips). |
| **First / last mile** | How do you get to the station/airport, then to your hotel/destination — transit vs Uber/Uber Shuttle/Lyft/Empower/taxi, priced, with a weather- and luggage-aware recommendation. |
| **Summary** | The assembled door-to-door plan: timeline, warnings, price breakdown, booking links (incl. your hotel), save. |
| **My Trip (dashboard)** | Countdown, next step, your stay, reminders with grace periods, timeline, ticket links, backups, emergency reroute. |

**Back and forward work at every step** — the top bar's arrows move through the interview and your answers are preserved; changing an earlier answer resets only what depends on it.

## Getting started

```bash
npm install
cp .env.example .env   # optional — the app runs fully on mock data without it
npm start              # Expo dev server; press i / a, or scan with Expo Go
```

Useful scripts:

```bash
npm run typecheck   # strict TypeScript check
npm test            # unit tests (recommendation scoring engine)
npm run web         # run in a browser
```

## Deploying as a website

The app exports to a fully static website (`npm run build` → `dist/`), so any static host works. Three ready-to-go options:

**Vercel (recommended — ~2 minutes)**
1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import this repository.
2. Vercel reads `vercel.json` automatically (build: `npm run build`, output: `dist`). Just click **Deploy**.
3. You get a live URL like `https://a2z.vercel.app`. Every push to the connected branch redeploys automatically.

**Netlify**
1. Go to [app.netlify.com/start](https://app.netlify.com/start), sign in with GitHub, and pick this repository.
2. Netlify reads `netlify.toml` automatically. Click **Deploy**.

**GitHub Pages (no extra account needed)**
1. In the GitHub repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
2. Merge this branch into `main` (or run the workflow manually from the **Actions** tab → *Deploy web to GitHub Pages* → **Run workflow**).
3. The included workflow (`.github/workflows/deploy-web.yml`) tests, builds with the `/A2Z` base path, and publishes to `https://<your-username>.github.io/A2Z/`.

To host anywhere else, run `npm run build` and upload the `dist/` folder (set `EXPO_BASE_URL=/subpath` first if the site won't live at the domain root).

### Demo data

Mock data covers these corridors end-to-end (use the quick-fill chips on the Home screen):

- NYC → Boston (Acela, Northeast Regional, Delta Shuttle, FlixBus, driving)
- NYC → Washington DC
- Manhattan → JFK (LIRR + AirTrain, subway, Uber, driving)
- Manhattan → Newark Airport
- Boston Logan → downtown hotel (Silver Line, Blue Line, Uber)

Weather is deterministic per city + date, so different travel dates show different conditions (rain, heat, storms) and the advice changes with them.

## Folder structure

```
A2Z/
├── App.tsx                     # navigation shell (tabs + plan stack)
├── index.ts                    # Expo entry point
├── .env.example                # all supported API keys (never commit .env)
├── __tests__/
│   └── recommendationService.test.ts
└── src/
    ├── components/             # reusable UI (cards, timeline, badges, states…)
    ├── context/TripContext.tsx # search results, saved trips, preferences
    ├── data/cities.ts          # mock geocoding + corridor resolution
    ├── navigation/types.ts
    ├── screens/                # Home, Results, RouteDetail, Dashboard, Settings
    ├── services/               # ALL external data goes through these
    │   ├── config.ts           # env-driven API config (mock vs live)
    │   ├── flightService.ts    # → Amadeus / Duffel
    │   ├── trainService.ts     # → rail content APIs / GTFS
    │   ├── busService.ts       # → bus aggregator APIs / GTFS
    │   ├── weatherService.ts   # → OpenWeather / WeatherAPI
    │   ├── mapsService.ts      # → Google Maps Directions / Transitland
    │   ├── rideshareService.ts # → Uber / Uber Shuttle / Lyft / Empower / taxi
    │   ├── accessService.ts    # first/last-mile options + recommendations
    │   ├── hotelService.ts     # → Amadeus Hotels / Booking.com
    │   ├── locationService.ts  # geolocation + (mock) reverse geocoding
    │   ├── tsaService.ts       # → TSA wait data + airport plan builder
    │   ├── deepLinkService.ts  # deep links + web fallbacks (pure)
    │   ├── recommendationService.ts # scoring engine (pure, unit-tested)
    │   ├── tripService.ts      # orchestrator: builds door-to-door RouteOptions
    │   └── storageService.ts   # AsyncStorage saved trips
    ├── theme/                  # design tokens
    ├── types/                  # domain model (TripSearch, RouteOption, …)
    └── utils/time.ts
```

## Live data — what's real and what's estimated

| Data | Source | Status |
| --- | --- | --- |
| Weather (origin + destination, for your travel date) | **Open-Meteo** — free, keyless, called from the visitor's browser | **Live by default** |
| Road distance/time (driving, rentals) | **OSRM** public router + **Nominatim/Open-Meteo geocoding** | **Live by default** |
| Flight fares | **Amadeus** (free self-service keys) | Live once you add keys; estimates otherwise |
| Train/bus fares | No public fare APIs exist (and scraping Amtrak/FlixBus violates their terms) | Calibrated estimates, clearly labeled |
| Booking | Real provider sites opened with your route + date pre-filled: Google Flights, Wanderu (live Amtrak/bus fares), Kayak (rentals), Booking.com (hotels with check-in/out) | **Live** |
| Trip reminders | Browser Notification API (expo-notifications hook point for native) | Works while the site is open |
| AI Concierge + AI fare estimates | **Anthropic Claude** (`claude-opus-4-8`) via `EXPO_PUBLIC_ANTHROPIC_API_KEY`; deterministic local curation without a key | Live once you add a key |
| Transit routes (which subway/bus, alternates, clock times) | **Google Directions** (`alternatives=true`) with a key; **Transitous** (keyless GTFS routing) otherwise; curated named-line paths as final fallback | Live with key / keyless best-effort |
| Rideshare prices | City-indexed calibrated model; **Claude** recalibrates to today's real UberX band when the Anthropic key is set; Uber/Lyft price APIs hook point remains | Better estimates by default; AI-refined with key |
| Flight status (delays, cancellations, gates) | **aviationstack** via `EXPO_PUBLIC_AVIATIONSTACK_API_KEY` — My Trip banner + browser notification | Live once you add a key |
| TSA security lines | **TSA Wait Times API** via `EXPO_PUBLIC_TSA_WAIT_API_KEY` — feeds arrival & leave-home advice + My Trip card | Live once you add a key; per-airport/hour estimates otherwise |

Every live call fails fast into the mock layer, so the app always works — offline, in CI, or if a free API has an outage. Set `EXPO_PUBLIC_LIVE_DATA=off` to force deterministic mock mode.

### Enabling every real-time source

1. Copy `.env.example` to `.env`, set `EXPO_PUBLIC_API_MODE=live`, then add keys:
2. **Google Maps** (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`): Google Cloud Console → enable *Directions API* → create key. Unlocks accurate transit routes with alternates, real fares, headways, and clock times.
3. **Anthropic** (`EXPO_PUBLIC_ANTHROPIC_API_KEY`): console.anthropic.com. Unlocks the AI concierge and AI-refined rideshare price bands. Ship via a backend proxy in production.
4. **aviationstack** (`EXPO_PUBLIC_AVIATIONSTACK_API_KEY`): aviationstack.com free plan (100 req/mo, HTTP-only — HTTPS needs a paid tier when hosted on Vercel).
5. **TSA Wait Times** (`EXPO_PUBLIC_TSA_WAIT_API_KEY`): request a free key at tsawaittimes.com/api.
6. **Amadeus** (`EXPO_PUBLIC_AMADEUS_CLIENT_ID/SECRET`): developers.amadeus.com self-service. Unlocks live flight fares.
7. On Vercel, add the same variables in *Project → Settings → Environment Variables* and redeploy (Expo inlines `EXPO_PUBLIC_*` at build time).

## Architecture notes

**Service abstraction.** Every screen talks to services that return `ServiceResult<T>` (`{ ok: true, data } | { ok: false, error, code }`). Each service contains a clearly marked `REAL API:` comment showing exactly where and how to connect the live provider (endpoint, auth, mapping target). Because the mocks return the same domain types, swapping in Amadeus/OpenWeather/Google Directions changes zero UI code.

**Environment variables.** All keys live in `.env` as `EXPO_PUBLIC_*` variables read by `src/services/config.ts`. Nothing is hardcoded. `EXPO_PUBLIC_API_MODE=mock|live` gates live calls, and each service independently falls back to mock when its key is missing. Note: rideshare server tokens must be proxied through a backend in production — never ship them in the app bundle.

**Recommendation engine.** `recommendationService.ts` is pure TypeScript: it normalizes price/time/walking/weather/transfers/reliability/delay-risk/comfort across the candidate set, weights them by the user's preference, assigns the four headline badges, and writes plain-English explanations ("It is $42 more than the bus, but saves 1h 20m…"). Covered by unit tests.

**Error handling.** Missing weather → warnings silently drop out; missing prices → line items show *N/A*, the total is flagged partial, and the route can't win "Cheapest"; an unavailable provider → that mode simply contributes no routes; zero routes → friendly empty state; search failure → error state with retry.

**Deep links.** `deepLinkService.ts` generates official Uber/Lyft/Google Maps/Apple Maps deep links with web fallbacks; `BookingLinks` tries the native app first via `Linking.canOpenURL`. Airline/Amtrak/FlixBus buttons open official booking pages. No scraping anywhere.

## Real APIs to connect later

| Service file | Provider options |
| --- | --- |
| `weatherService` | OpenWeather One Call, WeatherAPI |
| `mapsService` | Google Maps Directions, Transitland / GTFS |
| `flightService` | Amadeus Flight Offers, Duffel |
| `trainService` | Rome2Rio, licensed rail content, GTFS |
| `busService` | FlixBus affiliate, Busbud/Wanderu partners, GTFS |
| `rideshareService` | Uber price estimates, Lyft cost API (via backend proxy) |
| `tsaService` | MyTSA historical waits, airport open-data feeds |
| `MapPreview` | react-native-maps + Directions polylines, or Static Maps |
