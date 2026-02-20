// polygons[i]        = one polygon (one outer ring + optional holes)
// polygons[i][0]     = outer ring
// polygons[i][1..]   = inner rings (holes)
// All coordinates are [lat, lon]
export interface Park {
  id: number;
  name?: string;
  polygons: [number, number][][][];
  boundingBox: [number, number, number, number]; // north, east, south, west
  area: number;
  center: [number, number];
  tags: string[];
}