export async function fetchMapData(
  south: number,
  west: number,
  north: number,
  east: number
) {
  const query = `
    [out:json][timeout:25];
    (
      way["leisure"="park"](${south},${west},${north},${east});
      relation["leisure"="park"](${south},${west},${north},${east});
      relation["leisure"="recreation_ground"](${south},${west},${north},${east});
      relation["leisure"="garden"](${south},${west},${north},${east});
      relation["leisure"="playground"](${south},${west},${north},${east});
      relation["leisure"="pitch"](${south},${west},${north},${east});

      // Natural green features
      relation["natural"="wood"](${south},${west},${north},${east});
      relation["natural"="scrub"](${south},${west},${north},${east});
      relation["natural"="grassland"](${south},${west},${north},${east});

      // Landuse greenery
      relation["landuse"="forest"](${south},${west},${north},${east});
      relation["landuse"="grass"](${south},${west},${north},${east});
      relation["landuse"="recreation_ground"](${south},${west},${north},${east});
      relation["landuse"="meadow"](${south},${west},${north},${east});
      relation["landuse"="village_green"](${south},${west},${north},${east});
      relation["landuse"="orchard"](${south},${west},${north},${east});
      relation["landuse"="vineyard"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch parks data');
  }
  let data = await response.json();
  return data.elements;
}
