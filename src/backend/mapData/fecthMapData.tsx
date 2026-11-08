import { getOverpassServerCandidates } from './overpassServer';
import { readJsonWithProgress, type DownloadProgress } from './readJsonWithProgress';

const LEISURE = '["leisure"~"^(park|recreation_ground|garden|playground|nature_reserve)$"]';
const NATURAL = '["natural"~"^(wood|scrub|grassland)$"]';
const LANDUSE = '["landuse"~"^(forest|allotments|recreation_ground|meadow|village_green|orchard|vineyard)$"]';

// Servers are tried in turn, so a retry after a failure goes to the next one
export function getServerUrl(south: number, west: number, north: number, east: number, attempt = 0) {
  const candidates = getOverpassServerCandidates((south + north) / 2, (west + east) / 2);
  return candidates[attempt % candidates.length];
}

export async function fetchMapData(
  south: number,
  west: number,
  north: number,
  east: number,
  onProgress?: DownloadProgress,
  attempt = 0
) {
  const area = `(${south},${west},${north},${east})`;

  // Ways only need their tags and outline, which leaves out the list of node ids, relations need their members
  const query = `
    [out:json][timeout:90];
    (
      way${LEISURE}${area};
      way${NATURAL}${area};
      way${LANDUSE}${area};
    );
    out tags geom;
    (
      relation${LEISURE}${area};
      relation${NATURAL}${area};
      relation${LANDUSE}${area};
    );
    out geom;
  `;

  const response = await fetch(getServerUrl(south, west, north, east, attempt), {
    method: 'POST',
    body: query,
  });

  if (!response.ok) {
    const error: any = new Error('Failed to fetch parks data');
    error.status = response.status;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }
  let data = await readJsonWithProgress(response, onProgress);
  return data.elements;
}