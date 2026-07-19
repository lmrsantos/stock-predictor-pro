// Single source of truth for curated sector membership.
// Re-exports the existing curated universe under the shared name expected
// by the cross-sector linkage engine and graph.
import type { SectorName } from "@/lib/cross-sector-linkages";
import { CURATED_SECTOR_UNIVERSES } from "@/lib/sector-universes";

export const SECTOR_MEMBERSHIP: Record<SectorName, string[]> =
  CURATED_SECTOR_UNIVERSES as Record<SectorName, string[]>;
