# A2Z — door-to-door travel planning

A2Z is an "everything you need to know before and during travel" assistant. Enter where you're starting, where you're going, and what matters to you — A2Z compares **flights, trains, buses, driving, rideshares, walking, and transit**, then produces a clear door-to-door plan: when to leave, every step on a timeline, honest all-in pricing (including the hidden costs), weather-aware advice, airport intelligence, and backup plans.

Built with **React Native + Expo + TypeScript**. All external data comes from a **mock API layer** designed so real providers can be dropped in behind the same interfaces.

## Screens

| Screen | What it does |
| --- | --- |
| **Home** | Search form: origin (with **Use my current location**), destination (a full address, someone's house, or just a city), a 14-day date picker, an optional morning/midday/night departure window, travelers, bags, preference, existing-ticket toggle. Sample-trip quick fills. |
| **Results** | Route options grouped into collapsible **dropdowns by mode — Flights, Trains, Buses, Cars & rideshare, Transit** — with *Best overall / Cheapest / Fastest / Least stressful* badges, weather strip, and a plain-English recommendation. |
| **Trip builder** | Step-by-step booking: the main travel method is Step 1; Steps 2–3 pick how to reach the station/airport and finish the trip, with live price comparisons across **transit, Uber, Uber Shuttle, Lyft, Empower, and taxi** plus a weather/luggage-aware recommendation. |
| **Route detail** | Full door-to-door timeline, airport plan (TSA, boarding, bag cutoff, leave-home-by), walk-vs-ride tradeoffs, price breakdown with hidden costs, booking deep links, backup plans. Save the trip from here — then A2Z offers **hotel recommendations** near your destination (airport-friendly stays first when you arrive by air). |
| **My Trip (dashboard)** | Countdown to leave, current next step, warnings, map preview, timeline, ticket links, backup options, emergency reroute. |
| **Settings** | Default preference and live-integration status. |

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

Every live call fails fast into the mock layer, so the app always works — offline, in CI, or if a free API has an outage. Set `EXPO_PUBLIC_LIVE_DATA=off` to force deterministic mock mode.

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
