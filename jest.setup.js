// Tests run against the deterministic mock layer — live keyless APIs
// (Open-Meteo, OSRM, Nominatim) are exercised in the browser, not in CI.
process.env.EXPO_PUBLIC_LIVE_DATA = 'off';

// AsyncStorage is a native module — use its official in-memory mock in tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
