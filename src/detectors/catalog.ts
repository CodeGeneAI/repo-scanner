export const DETECTOR_CATALOG = [
  { id: "framework", description: "Framework and library detection" },
  { id: "language", description: "Language and LOC detection" },
  { id: "monorepo", description: "Monorepo structure and components" },
] as const;

export type DetectorCatalogEntry = (typeof DETECTOR_CATALOG)[number];
export type DetectorId = DetectorCatalogEntry["id"];

export const DETECTOR_IDS: readonly DetectorId[] = DETECTOR_CATALOG.map(
  (entry) => entry.id,
);
