# Going Live: turning A2Z into a real app with real users

This guide takes A2Z from "static site with browser storage" to a real
product: a backend, user accounts, live data, and notifications. It is
written for someone with **zero** coding, Vercel, Supabase, or API
experience. Every step says exactly what to click and where.

**Division of labor for every step:** you create the accounts and copy
the keys (companies require a human with an email address, and sometimes
a credit card — Claude cannot and should not do that part for you).
Claude writes 100% of the code. When a step says "give the key to
Claude," that means: paste it into Vercel's environment variables (shown
in Step 2), never into the code or a chat.

---

## The big picture (read this first)

A "real app" has four layers, and you already have the first:

1. **The app itself** (done) — the website users see.
2. **A backend** — a computer in the cloud that runs YOUR code 24/7,
   keeps secrets safe, and talks to other companies' APIs. Without it,
   nothing can happen while a user's browser is closed.
3. **A database + accounts** — so trips belong to a person, not a
   browser, and follow them across devices.
4. **Integrations** — other companies' data and services. Each one is
   its own little signup, and they range from "free and instant" to
   "requires a signed business partnership."

**The honest ceiling:** two things you asked about cannot be fully done
by any solo developer at any price today:

- **Booking an Uber inside A2Z.** Uber closed its ride-request API to
  new developers years ago; access now requires a negotiated business
  partnership. The realistic best — which A2Z already does — is the
  one-tap handoff: at the right moment, A2Z notifies you "time to call
  your ride" and one tap opens Uber with your trip. That's the same
  ceiling Google Maps operates under.
- **Selling flights yourself.** Taking a traveler's money for an airline
  ticket makes you a travel merchant: it requires a registered business,
  a payments account, and an airline-content provider (like Duffel).
  It's a real company, not a feature. The realistic path is affiliate
  handoff links (free, and they can even pay YOU a commission).

Everything else — accounts, sync, live flight status, weather, real
transit data, push notifications, email alerts — is genuinely doable and
mostly free. Here's the order.

---

# PART 1 — FREE STEPS

## Step 1: Put the site on Vercel properly (free, ~15 minutes)

The site already runs on GitHub Pages. Vercel adds the one thing GitHub
Pages can't do: **serverless functions** — tiny pieces of backend that
run on demand. The flight-status proxy in `api/flight-status.js` is
already written and waiting for this.

1. Go to **https://vercel.com/signup** in your browser.
2. Click the **Continue with GitHub** button (black button, center of
   the page). A GitHub window pops up — click the green **Authorize
   Vercel** button. You now have a Vercel account; no card needed.
3. You land on the Vercel dashboard. Click **Add New…** (black button,
   top-right) → in the dropdown click **Project**.
4. You'll see "Import Git Repository" with a list of your GitHub repos.
   Find **A2Z** in the list and click the **Import** button next to it.
   (If the list is empty, click **Adjust GitHub App Permissions**, pick
   your username, select **All repositories**, click **Install**.)
5. On the "Configure Project" page that opens, change nothing — the
   repository already contains a `vercel.json` that tells Vercel how to
   build. Click the blue **Deploy** button and wait ~2 minutes.
6. One critical setting: Vercel builds the `main` branch by default, but
   this project lives on a different branch. From the project page,
   click **Settings** (tab across the top) → click **Git** in the left
   sidebar → find the **Production Branch** box → clear it and type
   exactly: `claude/a2z-travel-planning-mvp-4f1920` → click **Save**.
7. Go to the **Deployments** tab (top) → click the **⋯** menu on the
   newest row → **Redeploy** → confirm.

You now have a URL like `https://a2z-yourname.vercel.app` that updates
itself every time Claude pushes code, and it can run backend functions.

**Where keys go (you'll use this constantly):** Project page →
**Settings** tab → **Environment Variables** in the left sidebar. For
each key: type the name in the **Key** box (e.g.
`AVIATIONSTACK_API_KEY`), paste the value in the **Value** box, leave
all three environment checkboxes checked, click **Save**. Then redeploy
(Deployments tab → ⋯ → Redeploy) so the new key takes effect.

## Step 2: Create the backend — Supabase (free, ~20 minutes)

Supabase is a company that gives you a real database, user accounts
(sign-up/log-in), and server code, with a generous free tier: 500 MB of
database and 50,000 monthly users free — far more than you'll need for
a long time.

1. Go to **https://supabase.com** → click **Start your project**
   (green button, top-right).
2. Click **Continue with GitHub** → **Authorize supabase**.
3. You land on the dashboard. Click **New project** (green button).
4. Fill the form:
   - **Name**: `a2z`
   - **Database Password**: click **Generate a password**, then COPY IT
     into a note on your phone or a password manager. You rarely need
     it, but losing it is painful.
   - **Region**: pick the one closest to you (e.g. "East US").
   - **Pricing plan**: Free.
   Click **Create new project** and wait ~2 minutes while it provisions.
5. Get the two values Claude needs. In the left sidebar click the
   **gear icon (Project Settings)** at the bottom → click **API** in
   the settings list. You'll see:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key under "Project API keys" (a long string
     starting with `eyJ…`)
   Copy both into Vercel's Environment Variables (Step 1) as:
   - `EXPO_PUBLIC_SUPABASE_URL` = the Project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = the anon key
   (The anon key is DESIGNED to be public — safety comes from database
   rules, which Claude will write.)
6. Turn on email login: left sidebar → **Authentication** → under
   CONFIGURATION click **Sign In / Up** → make sure **Email** shows as
   enabled (it is by default).

**Then tell Claude:** "Supabase is set up." Claude will then build, in
code: the trips table with row-level security (each user can only see
their own trips), sign-up/log-in screens, and sync so a trip saved on
your phone appears on your laptop. Your existing browser-stored trips
get an "import into my account" button.

## Step 3: Notifications — OneSignal (free, ~20 minutes)

Browser notifications currently only fire while the A2Z tab is open.
Real push notifications (phone buzzes while the app is closed) need a
push service. OneSignal's free tier covers 10,000 web subscribers.

1. Go to **https://onesignal.com** → click **Get Started Free**
   (top-right) → sign up with your email (or Google).
2. After signup you land on "New App/Website". Type **A2Z** in the name
   box → under "Choose your Platform" click **Web** → click **Next:
   Configure Your Platform**.
3. Choose **Typical Site**. Fill in:
   - **Site Name**: A2Z
   - **Site URL**: your Vercel URL from Step 1 (e.g.
     `https://a2z-yourname.vercel.app`)
   - Leave everything else default. Click **Save**.
4. You'll be shown an **App ID** (a long dashed code) and there is a
   **Keys & IDs** page (Settings → Keys & IDs) with a **REST API key**.
   - Put the App ID in Vercel as `EXPO_PUBLIC_ONESIGNAL_APP_ID`
   - Put the REST API key in Vercel as `ONESIGNAL_REST_API_KEY`
     (no EXPO_PUBLIC prefix — this one must stay server-side).

**Then tell Claude:** "OneSignal is set up." Claude wires the site to
ask users "allow notifications?", and builds a Supabase scheduled
function that checks flights/TSA every few minutes **on the server**
and pushes "Your flight moved to 7:15 PM — leave by 4:11 PM" even when
the phone is in a pocket. This is the moment "monitoring while the app
is closed" stops being impossible.

## Step 4: Email alerts — Resend (free, ~10 minutes)

For "your trip tomorrow" summary emails. Free tier: 3,000 emails/month.

1. Go to **https://resend.com** → **Get Started** → sign up with GitHub.
2. On the dashboard, left sidebar → **API Keys** → click **Create API
   Key** → name it `a2z` → **Permission: Sending access** → **Add** →
   copy the key (shown once!).
3. Put it in Vercel as `RESEND_API_KEY` (server-side, no EXPO_PUBLIC).

Emails will come from `onboarding@resend.dev` until you own a domain
(Part 2) — fine for testing.

## Step 5: Free live-data keys (~20 minutes total)

Already live with no key at all: **weather** (Open-Meteo), **road
routing** (OSRM), **transit routing** (Transitous). These got real the
day the site launched.

- **TSA wait times** (free): go to **https://www.tsawaittimes.com/api**
  → fill the request form (name, email, describe the app in one line:
  "personal travel-planning app") → the key arrives by email → add to
  Vercel as `EXPO_PUBLIC_TSA_WAIT_API_KEY`.
- **Amadeus flight prices** (free test tier): go to
  **https://developers.amadeus.com** → **Register** → verify email →
  click your name (top-right) → **My Self-Service Workspace** →
  **Create New App** → name it `a2z` → you get an **API Key** and **API
  Secret** → add to Vercel as `EXPO_PUBLIC_AMADEUS_CLIENT_ID` and
  `EXPO_PUBLIC_AMADEUS_CLIENT_SECRET`. (Test tier = real prices, small
  monthly quota, some routes limited. Production tier exists when
  you outgrow it.)

---

# PART 2 — PAID STEPS (cheapest first, with real prices)

## Step 6: A real domain — ~$12/year

`a2z-yourname.vercel.app` works, but `youra2z.com` looks real and is
required for professional emails.

1. Go to **https://vercel.com/domains** (or Namecheap/Cloudflare) →
   search a name → buy it (typical `.com` is $10–15/year).
2. If bought on Vercel: Project → **Settings** → **Domains** → type the
   domain → **Add**. Done — Vercel wires it automatically.
3. In Resend: **Domains** → **Add Domain** → follow the 3 DNS records it
   shows (on Vercel: Settings → Domains → your domain → DNS records →
   add each one) → emails now come from `alerts@youra2z.com`.

## Step 7: Live flight status — $0–5/month

Two options:

- **FlightAware AeroAPI (recommended)**: go to
  **https://www.flightaware.com/aeroapi** → **Get Started** → sign up →
  choose the **Personal** tier: **$5 of free usage every month**, then
  pay-per-query (a status check is fractions of a cent — $5 covers
  hundreds of checks). Card required. Copy the API key to Vercel as
  `AVIATIONSTACK_API_KEY`'s replacement — tell Claude "I have AeroAPI"
  and the proxy gets updated for it.
- **aviationstack paid**: $49.99/month for the HTTPS tier. Only worth it
  if AeroAPI doesn't cover a route you need. Skip initially.

## Step 8: Google's transit routes — free credit, card required

Google gives $200/month of free Maps usage (thousands of route lookups)
but demands a credit card on file.

1. **https://console.cloud.google.com** → sign in with Google → agree →
   **Select a project** (top bar) → **New Project** → name `a2z` →
   **Create**.
2. Search bar at top: type **Routes API** → click it → **Enable** →
   Google walks you through **Billing** setup here (card details;
   you're auto-enrolled in the $200/month credit).
3. Left menu ☰ → **APIs & Services** → **Credentials** → **+ Create
   Credentials** → **API key** → copy it.
4. Click the key's name to edit → under **API restrictions** choose
   **Restrict key** → tick **Routes API** only. Under **Website
   restrictions** add your Vercel URL. **Save.** (This is what makes a
   public key safe.)
5. Vercel: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Step 9: AI features — ~$5 to start, pay-as-you-go

The concierge, packing lists, and chat parsing get sharper with Claude.

1. **https://console.anthropic.com** → sign up → **Billing** (left
   sidebar) → **Add funds** → $5 minimum with a card.
2. **API Keys** (left sidebar) → **Create Key** → name `a2z` → copy.
3. Vercel: `EXPO_PUBLIC_ANTHROPIC_API_KEY` for now. **Ask Claude to
   move AI calls behind a server proxy** once Supabase is live — that
   hides the key and is the production-correct setup. Typical hobby
   usage: a few dollars a month.

## Step 10: Native phone apps (optional) — $25 once + $99/year

The website already installs to a home screen (that's what the icon
work was). True App Store / Play Store apps come later:

- **Google Play**: $25 one-time developer fee (play.google.com/console).
- **Apple App Store**: $99/year (developer.apple.com).
- The app is built with Expo, so Claude can produce store-ready builds
  with Expo's EAS service (free tier available) when you're ready.
  Native apps also unlock nicer push notifications via Expo's free
  push service (replacing OneSignal on phones).

## Step 11: When free tiers run out (much later)

| Service | Free tier | First paid tier |
| --- | --- | --- |
| Vercel | Hobby: plenty for thousands of users | Pro $20/mo |
| Supabase | 500 MB DB, 50k users | Pro $25/mo |
| OneSignal | 10k web subscribers | ~$9/mo |
| Resend | 3k emails/mo | $20/mo |
| AeroAPI | $5 credit/mo | pay-per-use |
| Google Maps | $200 credit/mo | pay-per-use |

A2Z can realistically serve its first few thousand users for
**$12/year (domain) + ~$5–10/month (flight status + AI)**.

---

# What stays impossible (so you never chase it)

- **In-app Uber booking** — partnership-gated. The handoff + push
  notification ("time to call your ride" → one tap opens Uber) is the
  legitimate ceiling, and Claude can polish that flow further.
- **Selling tickets/hotels yourself** — requires forming a business,
  payment processing, and provider contracts (e.g. Duffel for flights:
  per-booking fees plus a business entity). Affiliate links (Expedia,
  Booking.com, Skyscanner partner programs — free to join once you have
  a domain) let A2Z hand off and even earn commission honestly.
- **Reading airline confirmation emails automatically** — needs Google
  OAuth verification of your app (a review process; doable later, but
  it requires the domain, a privacy policy, and patience).

---

# The order to actually do it

1. **This week (all free):** Step 1 (Vercel) → Step 2 (Supabase) →
   tell Claude → real accounts + cross-device sync get built.
2. **Next (free):** Step 3 (OneSignal) → tell Claude → real "flight
   moved, leave earlier" pushes with the Uber one-tap inside them.
3. **Then (free):** Steps 4–5 → email digests + TSA + flight prices.
4. **When ready to spend ~$20:** Steps 6–7 → domain + live flight
   status.
5. **When the app has real users:** Steps 8–10.

After each step, just say what you finished ("Supabase is done") and
the code side gets built for you.
