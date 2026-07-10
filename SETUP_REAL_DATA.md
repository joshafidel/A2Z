# A2Z — The Complete Beginner's Guide to Turning On Real Live Data

This guide assumes **zero** prior experience with Vercel, coding, or APIs.
Every click is written out. Budget 30–45 minutes to do everything, or 10
minutes if you only do Part 3 (Google Maps), which is the biggest upgrade.

*(You do NOT need Supabase or any database for any of this.)*

---

## Part 0 — The concepts, in plain English (2 minutes)

**What is an API?** A website for programs instead of people. When A2Z
wants to know "what's the subway route from here to JFK?", it asks
Google's computers through Google's API and gets an answer back.

**What is an API key?** A long password-like string (like
`AIzaSyD4f8...`) that identifies YOUR account when A2Z talks to those
companies. Each company gives you your own key when you sign up. Keys are
secrets — don't post them publicly.

**What is an environment variable?** A named setting the app reads, like a
labeled box: the label is the name (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) and
inside is your key. You'll create these boxes on Vercel's website.

**What is Vercel?** The service that hosts your A2Z website. When you
push code to GitHub, Vercel builds it into a website and serves it at your
`https://….vercel.app` address.

**The one rule that trips everyone up:** your settings get baked into the
website **when Vercel builds it**. Adding a key does nothing until you
click **Redeploy** (Part 2, step 8). If something "isn't working," it's
almost always this.

---

## Part 1 — Find your project on Vercel (2 minutes)

1. Open a browser and go to **https://vercel.com/dashboard**
2. Log in. If you deployed A2Z by importing the GitHub repo, click
   **Continue with GitHub** and use your GitHub account.
3. You'll land on a page listing your projects. Find the one named **a2z**
   (or whatever it was called when you imported the repository) and
   **click its name**.
4. You're now on the project's Overview page. Bookmark it — you'll come
   back here after every part below.

*Never deployed at all? Go to https://vercel.com/new, click Continue with
GitHub, pick the `A2Z` repository from the list, and click **Deploy** —
the project contains a `vercel.json` file that tells Vercel exactly how to
build it, so you don't change any settings. Two minutes later you'll have
a live URL.*

---

## Part 2 — How to add ANY setting to Vercel (you'll repeat this a lot)

This is the single skill the whole guide depends on. Practice it now by
adding the first required setting.

1. From your project's page, look at the horizontal menu near the top:
   *Overview · Deployments · Analytics · Speed Insights · Logs · Settings*.
   Click **Settings**.
2. A menu appears down the left side. Click **Environment Variables**.
3. You'll see a form with two main boxes:
   - **Key** — the setting's name. Type it EXACTLY as this guide shows,
     capital letters and underscores included. One typo = ignored.
   - **Value** — the secret itself.
4. Add this first one now:
   - Key: `EXPO_PUBLIC_API_MODE`
   - Value: `live`
5. Leave the environment checkboxes (Production / Preview / Development)
   all checked, and click **Save**.
6. You'll see it appear in the list below. That's it — one box filled.
7. **Repeat steps 3–5** for every key you collect in Parts 3–7.
8. **After you finish adding keys, rebuild the site:** click
   **Deployments** in the top menu → the top row is your latest build →
   click the **⋯** (three-dots) button at the right end of that row →
   click **Redeploy** → in the popup, click **Redeploy** again. Wait for
   the status to turn to **Ready** (~2 minutes). Now your keys are live.

Official Vercel help with screenshots if the page looks different:
https://vercel.com/docs/environment-variables

---

## Part 3 — Google Maps key → real subway/bus routes (10 min, biggest upgrade)

**What you get:** the exact route lists Google Maps shows (which subway,
which bus, 2–3 alternatives), real departure/arrival clock times, official
line colors, and real fares.

**Heads up before you start:** Google requires a credit card, but includes
a monthly free usage allowance that comfortably covers personal use — you
will almost certainly pay $0. The app uses Google's current **Routes API**
(the old "Directions API" is retired for new accounts, so ignore any
tutorial that mentions it).

Google's console changes its look often, so here are BOTH ways in — use
whichever matches what you see:

**The easy way — the Maps Platform welcome wizard:**

1. Go to **https://console.cloud.google.com/google/maps-apis** and sign in
   with any Google account (a plain Gmail works).
2. First visit triggers a setup wizard: it asks you to agree to terms,
   create a project (accept the suggested name or type `a2z`), and **set up
   billing** — follow the card form; this is what activates the free
   monthly allowance. New accounts usually also get a 90-day free-trial
   credit on top.
3. At the end, the wizard shows **your API key** in a popup — click the
   copy icon and save it somewhere for a minute. (It also enables the
   standard bundle of Maps APIs for you, which includes Routes.)
4. Missed the popup? In the left sidebar of the Maps Platform page click
   **Keys & Credentials** — your key (often named "Maps Platform API Key")
   is listed there with a **SHOW KEY** / copy option.

**If you don't get a wizard (existing Google Cloud users):**

1. Same page: **https://console.cloud.google.com/google/maps-apis**
2. Make sure a project is selected in the dropdown at the very top.
3. Left sidebar → **APIs & Services** → find **Routes API** in the list →
   click it → click **Enable** if it isn't already.
4. Left sidebar → **Keys & Credentials** → **+ Create credentials → API
   key** → copy it.

**Then, either way:**

5. *(Recommended, 1 min)* Protect the key: on **Keys & Credentials**, click
   the pencil/⋮ next to your key → under **Application restrictions**
   choose **Websites** → **Add** → enter `https://YOUR-APP.vercel.app/*`
   (your real address is on the Vercel Overview page) → Save.
6. On Vercel (Part 2 recipe):
   - Key: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
   - Value: *(paste the key — starts with `AIza`)*
7. **Redeploy** (Part 2, step 8).

**Check it worked:** open your site → plan any trip with a flight → on the
"Getting to …" step tap **Public transportation** → "routes — pick your
subway & bus lines". Routes now show real clock times (e.g.
"9:41 AM – 10:12 AM") and legs marked "Live route via Google Maps".

**If Google feels like too much:** skip it entirely. The app already pulls
real transit routes keylessly from Transitous (community GTFS routing) —
Google just makes them sharper and adds fares.

## Part 4 — Anthropic key → AI concierge + smarter ride prices (5 min)

**What you get:** the "Curate my travel plan" briefing is written live by
Claude, and Uber/Lyft/taxi estimates recalibrate to realistic price bands
per city.

**What it costs:** Anthropic bills per use; a few dollars of credit lasts
a long time at this app's usage.

1. Go to **https://console.anthropic.com** → **Sign up** (email or Google).
2. Once you're in, find **API Keys** (left sidebar or under Settings).
3. Click **Create Key** → name it `a2z` → **Create**.
4. **Copy the key NOW** (starts with `sk-ant-`) — it's shown only once.
   If you lose it, just delete it and create another.
5. If your account has no free credit: **Plans & Billing** → add $5.
6. On Vercel (Part 2 recipe):
   - Key: `EXPO_PUBLIC_ANTHROPIC_API_KEY`
   - Value: *(paste `sk-ant-...`)*
7. Redeploy.

**Check it worked:** finish planning a trip → on the summary screen press
**Curate my travel plan** → the card shows a small **"Powered by Claude"**
badge.

**Honest warning:** settings that start with `EXPO_PUBLIC_` are visible to
anyone who inspects your website's code. For a personal project that's an
acceptable trade-off; if you ever launch publicly, ask a developer (or me)
to move this one call behind a tiny server so the key stays hidden.

---

## Part 5 — aviationstack key → live flight status alerts (5 min)

**What you get:** My Trip shows "DL 1232 delayed 45 min — new departure
4:45 PM", gate/terminal info, and a phone/browser notification when your
flight is delayed or cancelled.

1. Go to **https://aviationstack.com** → click **GET FREE API KEY**.
2. Choose the **Free** plan → fill in name/email/password → sign up.
3. You land on a dashboard showing **Your API Access Key** — copy it.
4. On Vercel (Part 2 recipe):
   - Key: `EXPO_PUBLIC_AVIATIONSTACK_API_KEY`
   - Value: *(paste it)*
5. Redeploy.

**⚠ Important limitation:** the free plan only answers over plain HTTP,
and your Vercel site uses HTTPS — browsers refuse to mix the two. So on
the live site, flight status needs their **Basic plan** (~$10/mo, HTTPS).
The free key DOES work when testing on your own computer. If it's not
worth $10/mo to you, simply skip this part — the app works fine without
it, it just won't show live flight status.

**Check it worked:** save a trip that includes a flight → open **My Trip**
→ a status card appears under the countdown within seconds, and the
browser asks permission to send notifications.

---

## Part 6 — TSA Wait Times key → live security lines (5 min)

**What you get:** "Security at JFK: ~35 min right now (live)" on My Trip,
and the app's leave-home-by advice stretches automatically when the
line is long.

1. Go to **https://www.tsawaittimes.com/api**
2. Fill in the short form: your name, email, and what you'll use it for
   ("personal travel-planning app" is fine) → submit.
3. The API key arrives by **email** (usually quickly).
4. On Vercel (Part 2 recipe):
   - Key: `EXPO_PUBLIC_TSA_WAIT_API_KEY`
   - Value: *(paste it)*
5. Redeploy.

**Check it worked:** with a flight trip saved, My Trip's security card
says "(live)" at the end instead of "(estimate)".

---

## Part 7 — Amadeus keys → real airline fares (10 min, optional)

**What you get:** the flight ticket board shows actual current fares
("Live fare via Amadeus") instead of calibrated estimates.

1. Go to **https://developers.amadeus.com** → **Register** (top right) →
   create a free account and confirm your email.
2. Log in → click your name (top right) → **My Self-Service Workspace**.
3. Click **Create New App** → name: `a2z` → **Create**.
4. The app's page shows two values: **API Key** and **API Secret**. Copy
   both.
5. On Vercel, add TWO variables (Part 2 recipe, twice):
   - Key: `EXPO_PUBLIC_AMADEUS_CLIENT_ID` — Value: *(the API Key)*
   - Key: `EXPO_PUBLIC_AMADEUS_CLIENT_SECRET` — Value: *(the API Secret)*
6. Redeploy.

New Amadeus accounts start in their free **test environment**, which is
what the app calls — generous limits, occasional gaps in coverage. That's
normal.

**Check it worked:** flight tickets show a "Live fare via Amadeus" note.

---

## Part 8 — Final checklist

Open your live site and go to the **Settings tab** (bottom right):

- [ ] Every source you configured shows **Configured** (green) instead of
      **Mock**
- [ ] The header says **Mode: Live APIs** (that's the
      `EXPO_PUBLIC_API_MODE=live` variable from Part 2)
- [ ] Weather, road routing, and basic transit routing were **already
      live** before you started — they use free keyless services
      (Open-Meteo, OSRM, Nominatim, Transitous) and needed nothing from you

## Troubleshooting

| Problem | Cause & fix |
| --- | --- |
| Settings tab still says "Mock" for a key you added | You didn't **Redeploy** after saving the variable (Part 2, step 8) — or the Key name has a typo. Compare letter-by-letter. |
| Google routes never show clock times | The key isn't allowed: check that Directions API is **enabled**, the website restriction matches your real Vercel URL, and billing is set up. |
| "Powered by Claude" never appears | Key typo, or the Anthropic account has no credit. |
| Flight status never appears on the live site | The aviationstack free plan is HTTP-only (Part 5 warning) — upgrade or skip. |
| Everything works locally but not on the site | Local `.env` and Vercel variables are separate — add the keys on Vercel too, then Redeploy. |
| Want to undo everything | Delete the variables on Vercel, or set `EXPO_PUBLIC_API_MODE` back to `mock`, and Redeploy. Nothing breaks — the app falls back to its built-in demo data. |

## Appendix — running on your own computer (optional)

Only needed if you develop locally with `npm run web`:

1. Install **Visual Studio Code** (free): https://code.visualstudio.com
2. VS Code → **File → Open Folder…** → your A2Z folder.
3. Click `.env.example` in the left file list, copy all its contents.
4. Right-click the file list → **New File** → name it exactly `.env` →
   paste → save.
5. Change `EXPO_PUBLIC_API_MODE=mock` to `EXPO_PUBLIC_API_MODE=live` and
   paste your keys after the `=` signs (no spaces, no quotes).
6. Restart the dev server. `.env` is gitignored, so it can't be pushed to
   GitHub by accident.
