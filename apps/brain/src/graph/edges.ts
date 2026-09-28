import { all, run, tx } from "../db/index.ts";

type Evidence = Record<string, unknown>;
type EdgeAcc = { weight: number; evidence: Evidence };

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Year-month interval overlap for two roles; undefined when either lacks dates. */
function overlap(
  s1?: string | null,
  e1?: string | null,
  s2?: string | null,
  e2?: string | null,
) {
  if (!s1 || !s2) return undefined;
  const now = new Date().toISOString().slice(0, 7);
  const norm = (d: string) => (d.length === 4 ? `${d}-01` : d.slice(0, 7));
  const from = [norm(s1), norm(s2)].sort()[1];
  const to = [e1 ? norm(e1) : now, e2 ? norm(e2) : now].sort()[0];
  return from <= to ? { from, to } : undefined;
}

/**
 * Derive person<->person links from shared evidence: email threads, meetings,
 * overlapping jobs and schools. Links to you are relationship strength, not edges.
 */
export function computeEdges() {
  const edges = new Map<string, Map<string, EdgeAcc>>(); // kind -> pair -> acc
  const add = (
    kind: string,
    a: string,
    b: string,
    weight: number,
    update: (ev: Evidence) => void,
  ) => {
    if (a === b) return;
    const byKind = edges.get(kind) ?? new Map<string, EdgeAcc>();
    edges.set(kind, byKind);
    const key = pairKey(a, b);
    const acc = byKind.get(key) ?? { weight: 0, evidence: {} };
    acc.weight += weight;
    update(acc.evidence);
    byKind.set(key, acc);
  };

  // Shared small threads and meetings (≤ 12 people; big ones say little about a relationship).
  const groups = all<{
    gid: string;
    kind: string;
    subject: string | null;
    at: string;
    people: string;
  }>(
    `SELECT COALESCE(i.thread_id, i.id) AS gid, i.kind, MAX(i.subject) AS subject, MAX(i.occurred_at) AS at,
            GROUP_CONCAT(DISTINCT pa.person_id) AS people
     FROM interactions i
     JOIN participants pa ON pa.interaction_id = i.id
     JOIN people p ON p.id = pa.person_id AND p.is_me = 0
     WHERE i.kind IN ('email', 'meeting', 'dm', 'linkedin_message') AND i.is_bulk = 0 AND i.occurred_at <= datetime('now')
     GROUP BY gid, i.kind`,
  );
  for (const g of groups) {
    const people = g.people.split(",");
    if (people.length < 2 || people.length > 12) continue;
    const kind = g.kind === "meeting" ? "met_together" : "shared_thread";
    const weight =
      (g.kind === "meeting" ? 2 : 1) / Math.sqrt(people.length - 1);
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        add(kind, people[i], people[j], weight, (ev) => {
          ev.count = ((ev.count as number) ?? 0) + 1;
          if (!ev.lastAt || g.at > (ev.lastAt as string)) {
            ev.lastAt = g.at;
            ev.lastSubject = g.subject;
          }
        });
      }
    }
  }

  // Overlapping employment at the same company.
  const jobs = all<{
    person_id: string;
    company: string;
    company_key: string;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: number;
  }>(
    `SELECT e.person_id, e.company, e.company_key, e.title, e.start_date, e.end_date, e.is_current
     FROM employment e JOIN people p ON p.id = e.person_id AND p.is_me = 0`,
  );
  const byCompany = new Map<string, typeof jobs>();
  for (const j of jobs)
    byCompany.set(j.company_key, [...(byCompany.get(j.company_key) ?? []), j]);
  for (const list of byCompany.values()) {
    if (list.length < 2 || list.length > 300) continue;
    for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length; k++) {
        const a = list[i];
        const b = list[k];
        if (a.person_id === b.person_id) continue;
        const o = overlap(a.start_date, a.end_date, b.start_date, b.end_date);
        if (o) {
          const months =
            (Number(o.to.slice(0, 4)) - Number(o.from.slice(0, 4))) * 12 +
            Number(o.to.slice(5, 7)) -
            Number(o.from.slice(5, 7)) +
            1;
          add(
            "worked_together",
            a.person_id,
            b.person_id,
            Math.min(4, 1 + months / 12),
            (ev) => {
              ev.company = a.company;
              ev.from = o.from;
              ev.to = o.to;
              ev.months = months;
            },
          );
        } else if (
          a.is_current &&
          b.is_current &&
          !a.start_date &&
          !b.start_date
        ) {
          add("same_company", a.person_id, b.person_id, 0.75, (ev) => {
            ev.company = a.company;
          });
        }
      }
    }
  }

  // Overlapping time at the same school.
  const schools = all<{
    person_id: string;
    school: string;
    school_key: string;
    start_date: string | null;
    end_date: string | null;
  }>(
    "SELECT ed.person_id, ed.school, ed.school_key, ed.start_date, ed.end_date FROM education ed JOIN people p ON p.id = ed.person_id AND p.is_me = 0",
  );
  const bySchool = new Map<string, typeof schools>();
  for (const s of schools)
    bySchool.set(s.school_key, [...(bySchool.get(s.school_key) ?? []), s]);
  for (const list of bySchool.values()) {
    if (list.length < 2 || list.length > 300) continue;
    for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length; k++) {
        const o = overlap(
          list[i].start_date,
          list[i].end_date,
          list[k].start_date,
          list[k].end_date,
        );
        if (!o) continue;
        add(
          "studied_together",
          list[i].person_id,
          list[k].person_id,
          1,
          (ev) => {
            ev.school = list[i].school;
            ev.from = o.from;
            ev.to = o.to;
          },
        );
      }
    }
  }

  let total = 0;
  tx(() => {
    run("DELETE FROM edges");
    for (const [kind, pairs] of edges) {
      for (const [key, acc] of pairs) {
        const [a, b] = key.split("|");
        run(
          "INSERT INTO edges (a, b, kind, weight, evidence) VALUES (?, ?, ?, ?, ?)",
          a,
          b,
          kind,
          acc.weight,
          JSON.stringify(acc.evidence),
        );
        total++;
      }
    }
  });
  return total;
}
