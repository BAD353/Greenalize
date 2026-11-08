export interface OverpassServer {
  id: string;
  name: string;
  url: string;
  note: string;
}

// Free public instances listed on https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
export const OVERPASS_SERVERS: OverpassServer[] = [
  {
    id: "dresel",
    name: "Dresel Systems",
    url: "https://ovp.dresel.systems/api/interpreter",
    note: "Hosted in Germany, queries are limited per IP address.",
  },
  {
    id: "private-coffee",
    name: "private.coffee",
    url: "https://overpass.private.coffee/api/interpreter",
    note: "No rate limit, but please do not use it for large scale projects.",
  },
  {
    id: "main",
    name: "overpass-api.de",
    url: "https://overpass-api.de/api/interpreter",
    note: "The main instance, often overloaded.",
  },
  {
    id: "vk-maps",
    name: "VK Maps",
    url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    note: "No request limits.",
  },
];

export const AUTO_SERVER_ID = "auto";

const STORAGE_KEY = "overpass_server";

// Rough bounding box of Europe, used to pick the server closest to the area being loaded
const EUROPE = { south: 34, north: 72, west: -25, east: 45 };

const SERVERS_BY_ID = Object.fromEntries(OVERPASS_SERVERS.map((s) => [s.id, s]));

export function isInEurope(lat: number, lng: number) {
  return lat >= EUROPE.south && lat <= EUROPE.north && lng >= EUROPE.west && lng <= EUROPE.east;
}

export function isValidOverpassUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname.endsWith("/interpreter");
  } catch {
    return false;
  }
}

// The saved choice is a server URL, or nothing when the server is picked automatically
export function getSavedOverpassServerUrl(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isValidOverpassUrl(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setOverpassServerUrl(url: string | null) {
  if (url) localStorage.setItem(STORAGE_KEY, url);
  else localStorage.removeItem(STORAGE_KEY);
}

// Servers to try for an area, best first. A server picked by the user is the only one used, otherwise the nearest
// server comes first and the others serve as fallbacks when it is busy.
export function getOverpassServerCandidates(lat: number, lng: number): string[] {
  const saved = getSavedOverpassServerUrl();
  if (saved) return [saved];

  const preferred = isInEurope(lat, lng) ? ["dresel", "private-coffee", "main", "vk-maps"] : ["main", "private-coffee", "dresel", "vk-maps"];
  return preferred.map((id) => SERVERS_BY_ID[id].url);
}