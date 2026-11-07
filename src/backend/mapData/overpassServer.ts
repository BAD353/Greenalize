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
    note: "Default. Queries are limited per IP address.",
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
    note: "Hosted in Russia, no request limits.",
  },
];

const STORAGE_KEY = "overpass_server";
const DEFAULT_SERVER_URL = OVERPASS_SERVERS[0].url;

export function isValidOverpassUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname.endsWith("/interpreter");
  } catch {
    return false;
  }
}

export function getOverpassServerUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isValidOverpassUrl(stored) ? stored : DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

export function setOverpassServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url);
}