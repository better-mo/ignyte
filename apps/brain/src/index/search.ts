import { all } from "../db/index.ts";
import { companyKey } from "../identity/normalize.ts";
import type { PersonRow } from "../model.ts";
import { semanticSearch } from "./embeddings.ts";

export type SearchFilters = {
  city?: string;
  company?: string;
  community?: string;
  minStrength?: number;
  tier?: string;
  includeWeak?: boolean;
};

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "at",
  "who",
  "which",
  "people",
  "person",
  "someone",
  "and",
  "or",
  "for",
  "with",
  "to",
  "my",
  "i",
  "me",
  "know",
  "do",
]);

/** Turn free text into a forgiving FTS5 OR-query of prefix terms. */
export function ftsQuery(text: string): string | null {
  const terms = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
  if (!terms.length) return null;
  return [...new Set(terms)].map((t) => `"${t}"*`).join(" OR ");
}

function lexical(query: string, k = 2000): { id: string; score: number }[] {
  const q = ftsQuery(query);
  if (!q) return [];
  try {
    return all<{ person_id: string; rank: number }>(
      // bm25 column weights: person_id, name, headline, orgs, places, communities, doc
      `SELECT person_id, bm25(people_fts, 0, 8, 4, 4, 3, 3, 1) AS rank FROM people_fts WHERE people_fts MATCH ? ORDER BY rank LIMIT ?`,
      q,
      k,
    ).map((r) => ({ id: r.person_id, score: -r.rank }));
  } catch {
    return [];
  }
}

/** Hybrid retrieval: BM25 + embeddings fused with reciprocal rank, then structured filters. */
export async function searchPeople(
  query: string,
  filters: SearchFilters = {},
  limit = 15,
) {
  const where: string[] = ["p.is_me = 0", "p.hidden = 0"];
  const params: (string | number)[] = [];
  if (filters.city) {
    where.push("(p.city LIKE ? OR p.region LIKE ? OR p.country LIKE ?)");
    params.push(`%${filters.city}%`, `%${filters.city}%`, `%${filters.city}%`);
  }
  if (filters.company) {
    where.push(
      "EXISTS (SELECT 1 FROM employment e WHERE e.person_id = p.id AND (e.company_key = ? OR e.company_key LIKE ?))",
    );
    const key = companyKey(filters.company);
    params.push(key, `%${key}%`);
  }
  if (filters.community) {
    where.push(
      "EXISTS (SELECT 1 FROM memberships m JOIN communities c ON c.id = m.community_id WHERE m.person_id = p.id AND c.name LIKE ?)",
    );
    params.push(`%${filters.community}%`);
  }
  if (filters.tier) {
    where.push("p.tier = ?");
    params.push(filters.tier);
  }
  const minStrength = filters.minStrength ?? (filters.includeWeak ? 0 : 1);
  where.push("p.strength >= ?");
  params.push(minStrength);

  const allowed = all<PersonRow>(
    `SELECT * FROM people p WHERE ${where.join(" AND ")}`,
    ...params,
  );
  const byId = new Map(allowed.map((p) => [p.id, p]));
  if (!query.trim()) {
    return allowed
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit)
      .map((p) => ({
        person: p,
        score: p.strength / 100,
        matchedBy: ["filters"],
      }));
  }

  const [lex, sem] = await Promise.all([
    lexical(query),
    semanticSearch(query).catch(() => []),
  ]);
  const fused = new Map<string, { score: number; matchedBy: string[] }>();
  const fuse = (list: { id: string }[], label: string) =>
    list.forEach((r, rank) => {
      if (!byId.has(r.id)) return;
      const v = fused.get(r.id) ?? { score: 0, matchedBy: [] };
      v.score += 1 / (60 + rank);
      v.matchedBy.push(label);
      fused.set(r.id, v);
    });
  fuse(lex, "keywords");
  fuse(sem, "meaning");
  return [...fused.entries()]
    .map(([id, v]) => ({
      person: byId.get(id)!,
      score: v.score + (byId.get(id)!.strength / 100) * 0.004,
      matchedBy: v.matchedBy,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Full-text search over what people said: email subjects/snippets, DMs, community posts, meetings. */
export function searchActivity(
  query: string,
  opts: {
    personId?: string;
    since?: string;
    communityId?: string;
    limit?: number;
  } = {},
) {
  const q = ftsQuery(query);
  if (!q) return [];
  const params: (string | number)[] = [q];
  let extra = "";
  if (opts.since) {
    extra += " AND i.occurred_at >= ?";
    params.push(opts.since);
  }
  if (opts.personId) {
    extra +=
      " AND EXISTS (SELECT 1 FROM participants x WHERE x.interaction_id = i.id AND x.person_id = ?)";
    params.push(opts.personId);
  }
  if (opts.communityId) {
    extra += " AND i.community_id = ?";
    params.push(opts.communityId);
  }
  params.push(opts.limit ?? 15);
  try {
    return all<{
      id: string;
      kind: string;
      source: string;
      occurred_at: string;
      subject: string | null;
      snippet: string | null;
      url: string | null;
      community: string | null;
      people: string | null;
    }>(
      `SELECT i.id, i.kind, i.source, i.occurred_at, i.subject, i.snippet, i.url, c.name AS community,
              (SELECT GROUP_CONCAT(DISTINCT p.display_name || ' [' || p.id || ']') FROM participants pa JOIN people p ON p.id = pa.person_id
               WHERE pa.interaction_id = i.id AND p.is_me = 0) AS people
       FROM activity_fts f JOIN interactions i ON i.id = f.interaction_id
       LEFT JOIN communities c ON c.id = i.community_id
       WHERE activity_fts MATCH ? AND i.is_bulk = 0 ${extra}
       ORDER BY bm25(activity_fts, 0, 3, 1) + (julianday('now') - julianday(i.occurred_at)) / 365.0 LIMIT ?`,
      ...params,
    );
  } catch {
    return [];
  }
}
