/**
 * Vercel serverless function: real-time flight status proxy.
 *
 * Keeps the aviationstack key SERVER-SIDE (env var AVIATIONSTACK_API_KEY,
 * no EXPO_PUBLIC_ prefix — it never ships to the browser) and solves the
 * free tier's HTTP-only limitation: browsers can't call http:// from an
 * https:// page, but this server can.
 *
 * GET /api/flight-status?flight=DL1232
 *   200 → { data: [ { flight_status, departure: {...} } ] }  (provider shape)
 *   400 → bad flight number
 *   501 → key not configured (client falls back / shows nothing fake)
 *   502 → provider failure
 */

export default async function handler(req, res) {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) {
    res.status(501).json({ error: 'AVIATIONSTACK_API_KEY is not configured on the server.' });
    return;
  }

  const flight = String(req.query.flight ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  if (!/^[A-Z]{1,3}[0-9]{1,5}$/.test(flight)) {
    res.status(400).json({ error: 'Invalid flight number.' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Server-to-server: plain HTTP is what the free tier supports; no
    // browser mixed-content restriction applies here.
    const upstream = await fetch(
      `http://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${flight}`,
      { signal: controller.signal },
    );
    if (!upstream.ok) {
      res.status(502).json({ error: `Provider responded ${upstream.status}.` });
      return;
    }
    const body = await upstream.json();
    // Pass through only what the app needs — never the key, never extras.
    const row = Array.isArray(body?.data) ? body.data[0] : undefined;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json({
      data: row
        ? [
            {
              flight_status: row.flight_status ?? null,
              departure: {
                gate: row.departure?.gate ?? null,
                terminal: row.departure?.terminal ?? null,
                delay: row.departure?.delay ?? null,
                scheduled: row.departure?.scheduled ?? null,
                estimated: row.departure?.estimated ?? null,
              },
            },
          ]
        : [],
    });
  } catch {
    res.status(502).json({ error: 'Provider request failed or timed out.' });
  } finally {
    clearTimeout(timer);
  }
}
