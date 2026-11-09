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
  // Heatmap screenshot without any interface, shown on the loading screen
  screenshot: string;
  // Approximate size of the data file in megabytes, shown so people can decide before downloading on mobile data
  sizeMb: number;
}

const city = (
  id: string,
  name: string,
  country: string,
  lat: number,
  lng: number,
  bbox: PreloadedCity["bbox"],
  sizeMb: number
): PreloadedCity => ({
  id,
  name,
  country,
  lat,
  lng,
  zoom: 14,
  bbox,
  file: `/assets/data/cities/${id}.json`,
  screenshot: `/assets/screenshots/cities/${id}.jpg`,
  sizeMb,
});

export const PRELOADED_CITIES: PreloadedCity[] = [
  city("kyiv", "Kyiv", "Ukraine", 50.4501, 30.5234, [50.3, 30.3, 50.5, 30.7], 1.3),
  city("barcelona", "Barcelona", "Spain", 41.3874, 2.1686, [41.3, 1.9, 41.5, 2.3], 2.3),
  city("madrid", "Madrid", "Spain", 40.4168, -3.7038, [40.3, -3.9, 40.5, -3.5], 1.9),
  city("paris", "Paris", "France", 48.8566, 2.3522, [48.8, 2.1, 49.0, 2.5], 1.5),
  city("london", "London", "United Kingdom", 51.5072, -0.1276, [51.4, -0.3, 51.6, 0.1], 3.5),
  city("berlin", "Berlin", "Germany", 52.52, 13.405, [52.4, 13.2, 52.6, 13.6], 2.4),
  city("amsterdam", "Amsterdam", "Netherlands", 52.3676, 4.9041, [52.3, 4.7, 52.5, 5.1], 4.5),
  city("rome", "Rome", "Italy", 41.9028, 12.4964, [41.8, 12.3, 42.0, 12.7], 1.3),
];