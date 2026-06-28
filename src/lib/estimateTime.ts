import type { Resource } from "@/db/schema";

/**
 * Estimate study time in seconds for a single resource.
 * - Videos: real durationSeconds when known; else ~1MB ≈ 60s fallback.
 * - PDFs / docs / other: 1 minute per ~50 KB (PRD reading-speed assumption).
 */
export function estimateResourceSeconds(r: Resource): number {
  if (r.type === "video") {
    if (r.durationSeconds && r.durationSeconds > 0) return r.durationSeconds;
    if (r.size > 0) return Math.round((r.size / (1024 * 1024)) * 60);
    return 0;
  }
  if (r.size > 0) return Math.round((r.size / (50 * 1024)) * 60);
  return 0;
}

export function estimateTotalSeconds(resources: Resource[]): number {
  let total = 0;
  for (const r of resources) total += estimateResourceSeconds(r);
  return total;
}

/** "2h 40m", "45m", "30s". */
export function formatEstimate(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}
