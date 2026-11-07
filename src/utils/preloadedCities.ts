export interface PreloadedCity {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  zoom: number;
  // [south, west, north, east], aligned to the TILE_STEP grid so whole tiles can be marked as loaded
  bbox: [number, number, number, number];
  file: string;
}

export const PRELOADED_CITIES: PreloadedCity[] = [
  {
    id: "barcelona",
    name: "Barcelona",
    country: "Spain",
    lat: 41.3874,
    lng: 2.1686,
    zoom: 14,
    bbox: [41.3, 2.0, 41.5, 2.3],
    file: "/assets/data/cities/barcelona.json",
  },
];