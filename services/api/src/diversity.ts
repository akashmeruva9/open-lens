// Keeps the site from being all conflict and politics. The wire ranks events by how widely they are covered, which favours wars and
// elections; this nudges it to also write the best story for any category the site has none of yet (tech, sport, health, ...).

/** The site's sections, by the topic labels a story carries (see TOPICS in packages/config). */
export const CATEGORY_OF_TOPIC: Record<string, string> = {
  politics: "politics", elections: "politics", diplomacy: "politics", law: "politics", conflict: "politics",
  economy: "economy", business: "economy",
  climate: "climate", disaster: "climate",
  technology: "tech", science: "tech",
  health: "health",
  society: "society", education: "society", rights: "society", culture: "society", transport: "society",
  sport: "sport",
};

/** Sections we want represented, most wanted first (politics is always plentiful, so it is last). */
export const WANTED_CATEGORIES = ["tech", "sport", "health", "economy", "society", "climate", "politics"];

export const categoriesOf = (topics: string[]): string[] => [...new Set(topics.map((t) => CATEGORY_OF_TOPIC[t]).filter((c): c is string => Boolean(c)))];

/** How many stories (live or on the way, topics known) each section has. */
export function categoryCounts(stories: { topics: string[]; status: string }[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(WANTED_CATEGORIES.map((c) => [c, 0]));
  for (const s of stories) if (s.status !== "draft") for (const c of categoriesOf(s.topics)) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

/**
 * How much to favour a new candidate: a big bonus when it fills a section that has no story at all, a small one for a thin section,
 * nothing for a section that already has plenty. Never outweighs "widely covered" for ties among the same need.
 */
export function diversityBonus(topics: string[], counts: Record<string, number>): number {
  let best = 0;
  for (const c of categoriesOf(topics)) {
    const n = counts[c] ?? 0;
    const want = WANTED_CATEGORIES.length - Math.max(0, WANTED_CATEGORIES.indexOf(c)); // tech highest, politics lowest
    best = Math.max(best, n === 0 ? 100 + want : n < 3 ? 10 + want : 0);
  }
  return best;
}
