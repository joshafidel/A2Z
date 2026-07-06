// Tests run against the deterministic mock layer — live keyless APIs
// (Open-Meteo, OSRM, Nominatim) are exercised in the browser, not in CI.
process.env.EXPO_PUBLIC_LIVE_DATA = 'off';
