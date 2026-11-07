// Groups are based on the OSM wiki definitions of the leisure / natural / landuse values we fetch.
export interface TagGroup {
  id: string;
  name: string;
  description: string;
  enabledByDefault: boolean;
  /** How green this kind of area is (1 = a typical park), scales how far its influence reaches */
  greenness: number;
  tags: { tag: string; label: string }[];
}

export const TAG_GROUPS: TagGroup[] = [
  {
    id: "parks",
    name: "Parks & Gardens",
    description: "Public parks, gardens and village greens",
    enabledByDefault: true,
    greenness: 1,
    tags: [
      { tag: "park", label: "Park" },
      { tag: "garden", label: "Garden" },
      { tag: "village_green", label: "Village green" },
    ],
  },
  {
    id: "recreation",
    name: "Recreation",
    description: "Playgrounds and open areas for recreation",
    enabledByDefault: true,
    greenness: 0.7,
    tags: [
      { tag: "playground", label: "Playground" },
      { tag: "recreation_ground", label: "Recreation ground" },
    ],
  },
  {
    id: "reserves",
    name: "Nature Reserves",
    description: "Protected areas for wildlife and nature",
    enabledByDefault: true,
    greenness: 1.3,
    tags: [{ tag: "nature_reserve", label: "Nature reserve" }],
  },
  {
    id: "woods",
    name: "Woods & Forest",
    description: "Natural woodland and managed forest",
    enabledByDefault: false,
    greenness: 1.4,
    tags: [
      { tag: "wood", label: "Wood" },
      { tag: "forest", label: "Forest" },
    ],
  },
  {
    id: "grassland",
    name: "Grass & Scrub",
    description: "Meadows, grassland and scrubland",
    enabledByDefault: false,
    greenness: 0.9,
    tags: [
      { tag: "meadow", label: "Meadow" },
      { tag: "grassland", label: "Grassland" },
      { tag: "grass", label: "Grass" },
      { tag: "scrub", label: "Scrub" },
    ],
  },
  {
    id: "farmland",
    name: "Farmland & Orchards",
    description: "Allotments, orchards and vineyards",
    enabledByDefault: false,
    greenness: 0.6,
    tags: [
      { tag: "allotments", label: "Allotments" },
      { tag: "orchard", label: "Orchard" },
      { tag: "vineyard", label: "Vineyard" },
    ],
  },
];

// Greenest matching group wins, parks without a known tag count as a typical park
export function getParkGreenness(tags: string[] = []): number {
  const values = TAG_GROUPS.filter((g) => g.tags.some((t) => tags.includes(t.tag))).map((g) => g.greenness);
  return values.length ? Math.max(...values) : 1;
}

export const DEFAULT_SELECTED_TAGS: string[] = TAG_GROUPS
  .filter((g) => g.enabledByDefault)
  .flatMap((g) => g.tags.map((t) => t.tag));
