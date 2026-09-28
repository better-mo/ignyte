import { all, run, tx } from "../db/index.ts";
import { hash } from "../identity/normalize.ts";
import type { PersonRow } from "../model.ts";
import { myEvidence } from "../graph/query.ts";

/**
 * The retrieval document for one person: identity, career, places, communities,
 * relationship evidence, recent topics and your notes. This is what gets embedded
 * and full-text indexed, and what Claude reads first.
 */
export function buildDocument(p: PersonRow) {
  const jobs = all<{
    company: string;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: number;
    industry: string | null;
    tags: string | null;
  }>(
    `SELECT COALESCE(c.name, e.company) AS company, e.title, e.start_date, e.end_date, e.is_current, c.industry, c.tags
     FROM employment e LEFT JOIN companies c ON c.id = e.company_id
     WHERE e.person_id = ? ORDER BY e.is_current DESC, e.start_date DESC`,
    p.id,
  );
  const schools = all<{ school: string; degree: string | null }>(
    "SELECT school, degree FROM education WHERE person_id = ?",
    p.id,
  );
  const communities = all<{ name: string }>(
    "SELECT c.name FROM memberships m JOIN communities c ON c.id = m.community_id WHERE m.person_id = ?",
    p.id,
  ).map((c) => c.name);
  const groups = all<{ data: string }>(
    "SELECT data FROM observations WHERE person_id = ?",
    p.id,
  ).flatMap((o) => (JSON.parse(o.data).groups as string[] | undefined) ?? []);
  const topics = all<{
    subject: string | null;
    snippet: string | null;
    kind: string;
  }>(
    `SELECT i.subject, i.snippet, i.kind FROM participants pa JOIN interactions i ON i.id = pa.interaction_id
     WHERE pa.person_id = ? AND i.is_bulk = 0 AND i.kind IN ('email', 'meeting', 'dm', 'linkedin_message', 'community_post')
     ORDER BY i.occurred_at DESC LIMIT 12`,
    p.id,
  );
  const notes = all<{ body: string }>(
    "SELECT body FROM notes WHERE person_id = ? ORDER BY created_at DESC LIMIT 10",
    p.id,
  );
  const skills = all<{ data: string }>(
    "SELECT data FROM enrichments WHERE person_id = ? AND status = 'matched'",
    p.id,
  ).flatMap((e) => (JSON.parse(e.data).skills as string[] | undefined) ?? []);

  const place = [p.city, p.region, p.country].filter(Boolean).join(", ");
  const orgs = jobs.map(
    (j) =>
      `${j.title ? `${j.title} at ` : ""}${j.company}${j.industry ? ` [${j.industry}]` : ""}${j.start_date ? ` (${j.start_date.slice(0, 4)}–${j.is_current ? "now" : (j.end_date?.slice(0, 4) ?? "?")})` : ""}`,
  );
  const lines = [
    `${p.display_name}${p.headline ? ` — ${p.headline}` : ""}`,
    place && `Based in ${place}`,
    orgs.length && `Career: ${orgs.join("; ")}`,
    schools.length &&
      `Education: ${schools.map((s) => [s.degree, s.school].filter(Boolean).join(", ")).join("; ")}`,
    communities.length && `Communities: ${communities.join(", ")}`,
    groups.length && `Your labels: ${[...new Set(groups)].join(", ")}`,
    skills.length && `Skills: ${skills.slice(0, 15).join(", ")}`,
    p.summary && `About: ${p.summary.slice(0, 600)}`,
    `Relationship: ${p.tier ?? "unknown"} (strength ${p.strength}/100, ${p.trend ?? "no trend"}). ${myEvidence(p.id).join(". ")}`,
    topics.length &&
      `Recent topics: ${topics
        .map((t) => (t.subject || t.snippet || "").slice(0, 120))
        .filter(Boolean)
        .join(" | ")}`,
    notes.length && `Your notes: ${notes.map((n) => n.body).join(" | ")}`,
  ].filter(Boolean) as string[];
  const doc = lines.join("\n");
  return {
    doc,
    hash: hash(doc),
    fts: {
      name: [p.display_name, p.first_name, p.last_name]
        .filter(Boolean)
        .join(" "),
      headline: [p.headline, p.title].filter(Boolean).join(" "),
      orgs:
        jobs
          .map(
            (j) =>
              `${j.company} ${j.title ?? ""} ${j.industry ?? ""} ${j.tags ? (JSON.parse(j.tags) as string[]).join(" ") : ""}`,
          )
          .join(" ") +
        " " +
        schools.map((s) => s.school).join(" "),
      places: place,
      communities: [...communities, ...groups].join(" "),
    },
  };
}

export function indexDocuments() {
  const people = all<PersonRow>("SELECT * FROM people WHERE is_me = 0");
  tx(() => {
    run("DELETE FROM people_fts");
    for (const p of people) {
      const d = buildDocument(p);
      run(
        "UPDATE people SET doc = ?, doc_hash = ? WHERE id = ?",
        d.doc,
        d.hash,
        p.id,
      );
      run(
        "INSERT INTO people_fts (person_id, name, headline, orgs, places, communities, doc) VALUES (?, ?, ?, ?, ?, ?, ?)",
        p.id,
        d.fts.name,
        d.fts.headline,
        d.fts.orgs,
        d.fts.places,
        d.fts.communities,
        d.doc,
      );
    }
  });
  return people.length;
}
