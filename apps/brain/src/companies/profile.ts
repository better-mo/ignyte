import { all, get } from "../db/index.ts";
import { findWarmPaths, myEvidence, peopleAtCompany } from "../graph/query.ts";
import { searchActivity } from "../index/search.ts";
import type { PersonRow } from "../model.ts";
import { companyDomains, type CompanyRow } from "./index.ts";

const personLine = (p: PersonRow, extra: Record<string, unknown> = {}) => ({
  id: p.id,
  name: p.display_name,
  headline: p.headline,
  city: p.city,
  strength: p.strength,
  tier: p.tier,
  photo: p.photo_url,
  ...extra,
});

/** Everything about one company from your network's point of view. */
export function companyProfile(c: CompanyRow) {
  const people = peopleAtCompany(c.id);
  const current = people
    .filter((p) => p.current)
    .sort((a, b) => b.person.strength - a.person.strength);
  const alumni = people
    .filter((p) => !p.current)
    .sort((a, b) => b.person.strength - a.person.strength);
  const paths = findWarmPaths({ company: c.id, limit: 4 });
  return {
    id: c.id,
    name: c.name,
    domain: c.domain,
    domains: companyDomains(c.id),
    also_known_as: all<{ value: string }>(
      "SELECT value FROM company_aliases WHERE company_id = ? AND kind = 'key'",
      c.id,
    ).map((a) => a.value),
    industry: c.industry,
    size: c.size ?? (c.employee_count ? `${c.employee_count} employees` : null),
    location: [c.city, c.region, c.country].filter(Boolean).join(", ") || null,
    founded: c.founded,
    funding_stage: c.funding_stage,
    description: c.description,
    tags: c.tags ? (JSON.parse(c.tags) as string[]) : [],
    linkedin: c.linkedin_url,
    enriched: c.enrich_status === "matched",
    current_people: current.slice(0, 30).map((r) =>
      personLine(r.person, {
        role: r.role,
        how_you_know_them: myEvidence(r.person.id).slice(0, 2),
      }),
    ),
    alumni: alumni
      .slice(0, 20)
      .map((r) => personLine(r.person, { role: r.role })),
    counts: { current: current.length, alumni: alumni.length },
    warm_paths: paths.map((p) => ({
      score: p.score,
      target_role: p.targetRole,
      people: p.people.map((x) => ({
        id: x.id,
        name: x.name,
        headline: x.headline,
        strength: x.strength,
      })),
      hops: p.hops.map((h) => ({
        confirmed: h.confirmed,
        evidence: h.evidence,
      })),
    })),
    recent_mentions: searchActivity(c.name, { limit: 8 }),
  };
}

export type CompanyListFilters = {
  query?: string;
  industry?: string;
  city?: string;
  minStrength?: number;
  currentOnly?: boolean;
  limit?: number;
};

/** Companies where you know someone, warmest access first. */
export function listCompanies(f: CompanyListFilters = {}) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const like = (v: string) => `%${v}%`;
  if (f.query) {
    where.push(
      "(c.name LIKE ? OR c.industry LIKE ? OR c.description LIKE ? OR c.tags LIKE ?)",
    );
    params.push(like(f.query), like(f.query), like(f.query), like(f.query));
  }
  if (f.industry) {
    where.push("(c.industry LIKE ? OR c.tags LIKE ? OR c.description LIKE ?)");
    params.push(like(f.industry), like(f.industry), like(f.industry));
  }
  if (f.city) {
    where.push("(c.city LIKE ? OR c.region LIKE ? OR c.country LIKE ?)");
    params.push(like(f.city), like(f.city), like(f.city));
  }
  const rows = all<
    CompanyRow & {
      current_people: number;
      alumni: number;
      best_current: number | null;
      best_any: number;
    }
  >(
    `SELECT c.*,
       COUNT(DISTINCT CASE WHEN e.is_current = 1 THEN p.id END) AS current_people,
       COUNT(DISTINCT CASE WHEN e.is_current = 0 THEN p.id END) AS alumni,
       MAX(CASE WHEN e.is_current = 1 THEN p.strength END) AS best_current,
       MAX(p.strength) AS best_any
     FROM companies c
     JOIN employment e ON e.company_id = c.id
     JOIN people p ON p.id = e.person_id AND p.is_me = 0 AND p.hidden = 0
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY c.id
     HAVING ${f.currentOnly ? "COALESCE(best_current, -1)" : "best_any"} >= ?
     ORDER BY COALESCE(best_current, 0) DESC, current_people DESC, best_any DESC
     LIMIT ?`,
    ...params,
    f.minStrength ?? 0,
    f.limit ?? 25,
  );
  return rows.map((c) => {
    const best = get<PersonRow & { title: string | null }>(
      `SELECT p.*, e.title FROM employment e JOIN people p ON p.id = e.person_id
       WHERE e.company_id = ? AND p.is_me = 0 AND p.hidden = 0 ORDER BY e.is_current DESC, p.strength DESC LIMIT 1`,
      c.id,
    );
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: c.size,
      location: [c.city, c.country].filter(Boolean).join(", ") || null,
      current_people: c.current_people,
      alumni: c.alumni,
      best_contact: best
        ? {
            id: best.id,
            name: best.display_name,
            title: best.title,
            strength: best.strength,
          }
        : null,
    };
  });
}
