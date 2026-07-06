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

function isoDay(iso?: string): string | undefined {
  return iso ? iso.slice(0, 10) : undefined;
}

/** City slug for Wanderu URLs: "New York, NY" → "new-york-ny". */
function wanderuSlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

/**
 * Google Flights search pre-filled with the real route + date. Google
 * shows live fares across airlines and hands off to the airline to book.
 */
export function buildFlightSearchLink(
  originCode: string,
  destCode: string,
  departureIso?: string,
): BookingLink {
  const day = isoDay(departureIso);
  const q = `Flights from ${originCode} to ${destCode}${day ? ` on ${day}` : ''}`;
  return {
    id: id('gflights'),
    label: 'Compare live fares (Google Flights)',
    provider: 'Google Flights',
    kind: 'flight',
    icon: 'airplane',
    webUrl: `https://www.google.com/travel/flights?q=${enc(q)}`,
  };
}

export function buildTrainBookingLink(
  provider: string,
  bookingUrl: string,
  opts: { originCity?: string; destCity?: string; departureIso?: string } = {},
): BookingLink {
  const day = isoDay(opts.departureIso);
  // Wanderu shows live Amtrak fares for the exact route/date, then links
  // through to Amtrak to complete the booking.
  const webUrl =
    opts.originCity && opts.destCity && day
      ? `https://www.wanderu.com/en-us/depart/${wanderuSlug(opts.originCity)}/${wanderuSlug(opts.destCity)}/${day}`
      : bookingUrl;
  return {
    id: id('train'),
    label: day ? `Live ${provider} fares for your date` : `Book on ${provider}`,
    provider,
    kind: 'train',
    icon: 'train',
    webUrl,
  };
}

export function buildBusBookingLink(
  provider: string,
  bookingUrl: string,
  opts: { originCity?: string; destCity?: string; departureIso?: string } = {},
): BookingLink {
  const day = isoDay(opts.departureIso);
  const webUrl =
    opts.originCity && opts.destCity && day
      ? `https://www.wanderu.com/en-us/depart/${wanderuSlug(opts.originCity)}/${wanderuSlug(opts.destCity)}/${day}`
      : bookingUrl;
  return {
    id: id('bus'),
    label: day ? `Live bus fares for your date` : `Book on ${provider}`,
    provider,
    kind: 'bus',
    icon: 'bus',
    webUrl,
  };
}

/**
 * Expedia one-way flight search pre-filled with the real route, date, and
 * traveler count (official URL format). Expedia shows live fares; booking
 * completes on their site. Airlines/Amtrak expose no public fare API, so
 * this handoff IS the live-price path.
 */
export function buildExpediaFlightLink(
  originCode: string,
  destCode: string,
  departureIso: string,
  travelers = 1,
): BookingLink {
  const d = new Date(departureIso);
  const mmddyyyy = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const leg = `from:${originCode},to:${destCode},departure:${mmddyyyy}TANYT`;
  return {
    id: id('expedia'),
    label: 'Purchase on Expedia',
    provider: 'Expedia',
    kind: 'flight',
    icon: 'airplane',
    webUrl: `https://www.expedia.com/Flights-Search?trip=oneway&leg1=${enc(leg)}&passengers=${enc(`adults:${travelers}`)}&mode=search`,
  };
}

/**
 * The right "purchase this ticket" handoff per mode: Expedia for flights,
 * Wanderu→Amtrak for trains (live Amtrak fares for the exact date),
 * FlixBus for buses.
 */
export function buildTicketPurchaseLink(
  mode: 'flight' | 'train' | 'bus',
  opts: {
    originCode?: string;
    destCode?: string;
    originCity?: string;
    destCity?: string;
    departureIso: string;
    travelers?: number;
  },
): BookingLink {
  if (mode === 'flight' && opts.originCode && opts.destCode) {
    return buildExpediaFlightLink(opts.originCode, opts.destCode, opts.departureIso, opts.travelers);
  }
  if (mode === 'train') {
    const link = buildTrainBookingLink('Amtrak', 'https://www.amtrak.com/tickets/departure.html', {
      originCity: opts.originCity,
      destCity: opts.destCity,
      departureIso: opts.departureIso,
    });
    return { ...link, label: 'Purchase Amtrak ticket' };
  }
  const link = buildBusBookingLink('FlixBus', 'https://www.flixbus.com', {
    originCity: opts.originCity,
    destCity: opts.destCity,
    departureIso: opts.departureIso,
  });
  return { ...link, label: 'Purchase bus ticket' };
}

/** Kayak rental-car search pre-filled with city + pickup/drop-off dates. */
export function buildRentalCarLink(
  city: string,
  pickupIso: string,
  dropoffIso?: string,
): BookingLink {
  const pickup = isoDay(pickupIso);
  const dropoff =
    isoDay(dropoffIso) ??
    new Date(new Date(pickupIso).getTime() + 86_400_000).toISOString().slice(0, 10);
  const citySlug = city.replace(/\s+/g, '-');
  return {
    id: id('rental'),
    label: 'Compare rental prices (Kayak)',
    provider: 'Kayak',
    kind: 'maps',
    icon: 'car',
    webUrl: `https://www.kayak.com/cars/${enc(citySlug)}/${pickup}/${dropoff}`,
  };
}

/** Booking.com search with real check-in/check-out dates. */
export function buildHotelSearchLink(city: string, checkinIso?: string, nights = 1): string {
  const base = `https://www.booking.com/searchresults.html?ss=${enc(city)}`;
  if (!checkinIso) return base;
  const checkin = new Date(checkinIso);
  const checkout = new Date(checkin.getTime() + nights * 86_400_000);
  return `${base}&checkin=${checkin.toISOString().slice(0, 10)}&checkout=${checkout.toISOString().slice(0, 10)}`;
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
