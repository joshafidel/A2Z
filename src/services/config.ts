/**
 * Central API configuration.
 *
 * All keys come from environment variables (see `.env.example`).
 * `EXPO_PUBLIC_*` vars are injected by Expo at build time — no secrets are
 * hardcoded anywhere in the codebase.
 *
 * While `apiMode` is "mock" (the default), every service returns realistic
 * mocked data. Flipping to "live" makes each service hit its real API using
 * the keys below; services individually fall back to mock when their key is
 * missing so a partially-configured app still works.
 */

export type ApiMode = 'mock' | 'live';

export const apiConfig = {
  mode: (process.env.EXPO_PUBLIC_API_MODE === 'live' ? 'live' : 'mock') as ApiMode,

  /**
   * Keyless live data (Open-Meteo weather, OSRM routing, Nominatim
   * geocoding). On by default — these are free, CORS-enabled APIs called
   * from the visitor's browser. Set EXPO_PUBLIC_LIVE_DATA=off to force
   * mock-only mode (e.g. for deterministic demos).
   */
  liveData: process.env.EXPO_PUBLIC_LIVE_DATA !== 'off',

  openWeatherApiKey: process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? '',
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  amadeusClientId: process.env.EXPO_PUBLIC_AMADEUS_CLIENT_ID ?? '',
  amadeusClientSecret: process.env.EXPO_PUBLIC_AMADEUS_CLIENT_SECRET ?? '',
  duffelApiKey: process.env.EXPO_PUBLIC_DUFFEL_API_KEY ?? '',
  rome2RioApiKey: process.env.EXPO_PUBLIC_ROME2RIO_API_KEY ?? '',
  transitlandApiKey: process.env.EXPO_PUBLIC_TRANSITLAND_API_KEY ?? '',
  uberServerToken: process.env.EXPO_PUBLIC_UBER_SERVER_TOKEN ?? '',
  lyftClientId: process.env.EXPO_PUBLIC_LYFT_CLIENT_ID ?? '',
  /** Real-time flight status (aviationstack.com). */
  aviationstackApiKey: process.env.EXPO_PUBLIC_AVIATIONSTACK_API_KEY ?? '',
  /** Real-time TSA security-line waits (tsawaittimes.com). */
  tsaWaitApiKey: process.env.EXPO_PUBLIC_TSA_WAIT_API_KEY ?? '',
} as const;

/** True when a given integration should use its live API. */
export function isLive(key: keyof typeof apiConfig): boolean {
  return apiConfig.mode === 'live' && Boolean(apiConfig[key]);
}

/** True when keyless live data sources should be attempted. */
export function liveDataEnabled(): boolean {
  return apiConfig.liveData;
}

/** fetch with a timeout — live calls must fail fast into the mock fallback. */
export async function fetchWithTimeout(url: string, ms = 3500, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Simulated network latency so mock mode exercises real loading states. */
export function mockDelay(ms = 80 + Math.random() * 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
