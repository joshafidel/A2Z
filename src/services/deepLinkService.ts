/**
 * Provider-linking service: builds deep links (native app) with web
 * fallbacks for every bookable provider. Pure functions — the UI opens
 * them with `Linking.openURL`, trying `deepLink` first, then `webUrl`.
 *
 * All link formats below are official, publicly documented deep-link
 * schemes (Uber/Lyft ride-request links, Google/Apple Maps URLs). No
 * scraping involved.
 */

import type { BookingLink, TransportMode } from '../types';

function enc(v: string): string {
  return encodeURIComponent(v);
}

let linkSeq = 0;
function id(prefix: string): string {
  linkSeq += 1;
  return `${prefix}-${linkSeq}`;
}

export function buildUberLink(pickup: string, dropoff: string): BookingLink {
  return {
    id: id('uber'),
    label: 'Open in Uber',
    provider: 'Uber',
    kind: 'rideshare',
    icon: 'car',
    deepLink: `uber://?action=setPickup&pickup[formatted_address]=${enc(pickup)}&dropoff[formatted_address]=${enc(dropoff)}`,
    webUrl: `https://m.uber.com/ul/?action=setPickup&pickup[formatted_address]=${enc(pickup)}&dropoff[formatted_address]=${enc(dropoff)}`,
  };
}

export function buildLyftLink(pickup: string, dropoff: string): BookingLink {
  return {
    id: id('lyft'),
    label: 'Open in Lyft',
    provider: 'Lyft',
    kind: 'rideshare',
    icon: 'car-sport',
    deepLink: `lyft://ridetype?id=lyft&pickup[address]=${enc(pickup)}&destination[address]=${enc(dropoff)}`,
    webUrl: `https://www.lyft.com/ride?destination=${enc(dropoff)}`,
  };
}

export function buildGoogleMapsLink(
  origin: string,
  destination: string,
  mode: TransportMode,
): BookingLink {
  const travelMode =
    mode === 'walk' ? 'walking' : mode === 'transit' || mode === 'airport-transfer' ? 'transit' : 'driving';
  return {
    id: id('gmaps'),
    label: 'Open in Google Maps',
    provider: 'Google Maps',
    kind: 'maps',
    icon: 'map',
    deepLink: `comgooglemaps://?saddr=${enc(origin)}&daddr=${enc(destination)}&directionsmode=${travelMode}`,
    webUrl: `https://www.google.com/maps/dir/?api=1&origin=${enc(origin)}&destination=${enc(destination)}&travelmode=${travelMode}`,
  };
}

export function buildAppleMapsLink(
  origin: string,
  destination: string,
  mode: TransportMode,
): BookingLink {
  const flag = mode === 'walk' ? 'w' : mode === 'transit' || mode === 'airport-transfer' ? 'r' : 'd';
  const url = `https://maps.apple.com/?saddr=${enc(origin)}&daddr=${enc(destination)}&dirflg=${flag}`;
  return {
    id: id('amaps'),
    label: 'Open in Apple Maps',
    provider: 'Apple Maps',
    kind: 'maps',
    icon: 'navigate',
    deepLink: url, // Apple Maps URLs open natively on iOS
    webUrl: url,
  };
}

export function buildAirlineBookingLink(provider: string, bookingUrl: string): BookingLink {
  return {
    id: id('air'),
    label: `Book flight on ${provider}`,
    provider,
    kind: 'flight',
    icon: 'airplane',
    webUrl: bookingUrl,
  };
}

export function buildTrainBookingLink(provider: string, bookingUrl: string): BookingLink {
  return {
    id: id('train'),
    label: `Book on ${provider}`,
    provider,
    kind: 'train',
    icon: 'train',
    webUrl: bookingUrl,
  };
}

export function buildBusBookingLink(provider: string, bookingUrl: string): BookingLink {
  return {
    id: id('bus'),
    label: `Book on ${provider}`,
    provider,
    kind: 'bus',
    icon: 'bus',
    webUrl: bookingUrl,
  };
}

export function buildTransitAppLink(origin: string, destination: string): BookingLink {
  return {
    id: id('transit'),
    label: 'Open in Transit app',
    provider: 'Transit',
    kind: 'transit',
    icon: 'subway',
    deepLink: `transit://directions?destination=${enc(destination)}`,
    webUrl: buildGoogleMapsLink(origin, destination, 'transit').webUrl,
  };
}
