# A2Z — Step-by-Step: Turning On Every Real-Time Data Source

Follow these in order. Steps 1–2 take five minutes and are shared by every
integration; steps 3–7 are one per provider and are independent — do any or
all. Each ends with "Verify" so you know it worked.

---

## 1. Create your local `.env` file

1. In the project root, copy the template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in any editor.
3. Change the first setting to:
   ```
   EXPO_PUBLIC_API_MODE=live
   ```
4. Leave `EXPO_PUBLIC_LIVE_DATA=on` as is (this keeps the free keyless
   sources — weather, road routing, transit routing — active).
5. Never commit `.env`. It is already in `.gitignore`.

## 2. Know where keys go on Vercel

Your local `.env` only affects `npm run web` / local builds. For the
deployed site:

1. Go to **vercel.com → your A2Z project → Settings → Environment Variables**.
2. For every key below, click **Add New**, paste the **Name** exactly as
   written (e.g. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) and the **Value** (the
   key), select all environments, and **Save**.
3. After adding keys, go to **Deployments → ⋯ on the latest → Redeploy**.
   This matters: Expo bakes `EXPO_PUBLIC_*` values in at build time, so new
   keys do nothing until you redeploy.
4. Also add `EXPO_PUBLIC_API_MODE` = `live` there once.

---

## 3. Google Maps — accurate transit routes (biggest upgrade)

Unlocks: the real route list (which subway, which bus, alternates), real
clock times, official line colors, published fares, and service frequency.

1. Go to **console.cloud.google.com** and sign in with a Google account.
2. Top bar → project dropdown → **New Project** → name it `a2z` → Create.
3. Left menu → **APIs & Services → Library**.
4. Search **"Directions API"** → open it → **Enable**.
   (If prompted, set up billing — Google requires a card, but gives a
   monthly free allowance that comfortably covers personal use.)
5. Left menu → **APIs & Services → Credentials** → **Create Credentials →
   API key**. Copy the key.
6. Click the new key to edit it → under **Application restrictions** choose
   **Websites** and add your Vercel domain (`https://your-app.vercel.app/*`)
   plus `http://localhost:*` for local testing → under **API restrictions**
   select **Directions API** → Save.
7. Put it in `.env` and Vercel:
   ```
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
   ```

**Verify:** plan any trip → first-mile step → "Public transportation" →
"routes — pick your subway & bus lines". Routes should show clock times
(e.g. 9:41 AM – 10:12 AM) and legs noted "Live route via Google Maps".

## 4. Anthropic — AI concierge + AI-refined ride prices

Unlocks: the "Curate my travel plan" briefing and Claude recalibrating the
Uber/Lyft/taxi comparison to today's real price band per city.

1. Go to **console.anthropic.com** → sign up / sign in.
2. **Settings → API Keys → Create Key** → name it `a2z` → copy the key
   (shown once).
3. Add credits under **Plans & Billing** if you don't have free credit.
4. Put it in `.env` and Vercel:
   ```
   EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
   ```

⚠ **Security note:** `EXPO_PUBLIC_*` values are visible in the browser
bundle. Fine for a personal demo; for a public product, create a tiny
backend endpoint that holds the key and forwards requests, and point
`aiService.ts` at it.

**Verify:** finish a plan → summary screen → "Curate my travel plan" shows
a "Powered by Claude" badge. Ride estimates on the first-mile step will
quietly recalibrate (first search in a city takes a beat longer).

## 5. aviationstack — real-time flight status alerts

Unlocks: the My Trip banner ("DL 1232 delayed 45 min — new departure
4:45 PM"), gate/terminal info, and a browser notification on important
changes.

1. Go to **aviationstack.com** → **Get Free API Key** → sign up.
2. Your dashboard shows the **API Access Key** — copy it.
3. Put it in `.env` and Vercel:
   ```
   EXPO_PUBLIC_AVIATIONSTACK_API_KEY=...
   ```
4. **Important limitation:** the free plan (100 requests/month) is
   **HTTP-only**. Your Vercel site is HTTPS, and browsers block HTTP calls
   from HTTPS pages — so on the deployed site you need their **Basic plan**
   (HTTPS) or a small proxy. The free key still works when testing locally
   over `http://localhost`.

**Verify:** save a trip with a flight, open **My Trip**. A status card
appears under the countdown within a few seconds and re-polls every
5 minutes. Allow notifications when prompted to get pop-up alerts.

## 6. TSA Wait Times — live security lines → smarter "leave by"

Unlocks: real queue length at your departure airport, feeding the
arrive-by/leave-home math and a My Trip card ("line is longer than
budgeted — leave ~15 min earlier").

1. Go to **tsawaittimes.com/api**.
2. Fill in the short request form (name + email + intended use); the key
   arrives by email.
3. Put it in `.env` and Vercel:
   ```
   EXPO_PUBLIC_TSA_WAIT_API_KEY=...
   ```

**Verify:** with a flight trip saved, My Trip shows "Security at JFK:
~NN min right now (live)". Without the key the same card logic uses
per-airport, per-hour estimates and says "(estimate)".

## 7. Amadeus — live flight fares (optional)

Unlocks: real airfares on the ticket board instead of calibrated estimates.

1. Go to **developers.amadeus.com** → **Register** (free self-service).
2. **My Self-Service Workspace → Create New App** → name it `a2z`.
3. Copy the **API Key** and **API Secret**.
4. Put them in `.env` and Vercel:
   ```
   EXPO_PUBLIC_AMADEUS_CLIENT_ID=...
   EXPO_PUBLIC_AMADEUS_CLIENT_SECRET=...
   ```
5. Note: new keys start in Amadeus's **test environment** (which the app
   uses) — quotas are generous for development; move to production keys on
   their site when ready.

**Verify:** ticket board flights show "Live fare via Amadeus" notes instead
of "Fare is an estimate…".

---

## 8. Final checklist

- [ ] `.env` locally + the same variables in Vercel, `EXPO_PUBLIC_API_MODE=live`
- [ ] Redeployed on Vercel after adding variables
- [ ] **Settings tab** in the app: each connected source now reads
      **Configured** instead of **Mock**
- [ ] Keyless sources (Open-Meteo weather, OSRM roads, Nominatim geocoding,
      Transitous transit) were already live — no action needed

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Settings still says "Mock" after adding a key | You didn't redeploy (Vercel) or restart `npm run web` (local) — `EXPO_PUBLIC_*` is baked at build time |
| Google routes never appear | Check the key allows your domain + Directions API is enabled; open the browser console for `REQUEST_DENIED` messages |
| Flight status never appears | Free aviationstack is HTTP-only — blocked on HTTPS sites (see step 5.4) |
| AI concierge shows the local plan | Key missing/exhausted credits; check the browser console for 401/429 |
| Everything suddenly mock | `EXPO_PUBLIC_LIVE_DATA=off` somewhere, or `EXPO_PUBLIC_API_MODE` isn't `live` |
