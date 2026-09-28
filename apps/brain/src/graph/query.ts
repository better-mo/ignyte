import { all, get } from "../db/index.ts";
import { companyKey } from "../identity/normalize.ts";
import type { PersonRow } from "../model.ts";
import type { StrengthDetail } from "./strength.ts";

export type PersonBrief = {
  id: string;
  name: string;
  headline: string | null;
  company: string | null;
  title: string | null;
  city: string | null;
  strength: number;
  tier: string | null;
  trend: string | null;
  lastInteractionAt: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
};

export const brief = (p: PersonRow): PersonBrief => ({
  id: p.id,
  name: p.display_name,
  headline: p.headline,
  company: p.company,
  title: p.title,
  city: p.city,
  strength: p.strength,
  tier: p.tier,
  trend: p.trend,
  lastInteractionAt: p.last_interaction_at,
  photoUrl: p.photo_url,
  linkedinUrl: p.linkedin_url,
});

export const getPerson = (id: string) =>
  get<PersonRow>("SELECT * FROM people WHERE id = ?", id);
export const me = () =>
  get<PersonRow>(
    "SELECT * FROM people WHERE is_me = 1 ORDER BY created_at LIMIT 1",
  );

const ago = (iso?: string | null) => {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(iso)) / 864e5);
  if (days < 0) return `in ${-days}d`;
  if (days < 1) return "today";
  if (days < 45) return `${days}d ago`;
  if (days < 540) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
};
const fmtRange = (from?: string, to?: string) => {
  const now = new Date().toISOString().slice(0, 7);
  return `${from?.slice(0, 4) ?? "?"}–${!to || to >= now ? "now" : to.slice(0, 4)}`;
};

export function sharedCommunities(
  a: string,
  b: string,
): { id: string; name: string }[] {
  return all<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM memberships m1
     JOIN memberships m2 ON m2.community_id = m1.community_id AND m2.person_id = ?
     JOIN communities c ON c.id = m1.community_id
     WHERE m1.person_id = ?`,
    b,
    a,
  );
}

/** Overlapping roles between two people, computed from employment rows (includes you). */
export function workedTogether(a: string, b: string) {
  const rows = all<{
    company: string;
    a_start: string | null;
    a_end: string | null;
    b_start: string | null;
    b_end: string | null;
  }>(
    `SELECT e1.company, e1.start_date AS a_start, e1.end_date AS a_end, e2.start_date AS b_start, e2.end_date AS b_end
     FROM employment e1 JOIN employment e2 ON e2.company_key = e1.company_key AND e2.person_id = ?
     WHERE e1.person_id = ?`,
    b,
    a,
  );
  const now = new Date().toISOString().slice(0, 7);
  const out: { company: string; from: string; to: string }[] = [];
  for (const r of rows) {
    if (!r.a_start || !r.b_start) continue;
    const from = [r.a_start.slice(0, 7), r.b_start.slice(0, 7)].sort()[1];
    const to = [
      r.a_end?.slice(0, 7) ?? now,
      r.b_end?.slice(0, 7) ?? now,
    ].sort()[0];
    if (from <= to && !out.some((o) => o.company === r.company))
      out.push({ company: r.company, from, to });
  }
  return out;
}

/** Human-readable evidence for how *you* know a person. */
export function myEvidence(personId: string): string[] {
  const p = getPerson(personId);
  if (!p?.strength_detail) return [];
  const d = JSON.parse(p.strength_detail) as StrengthDetail;
  const out: string[] = [];
  if (d.meetings) out.push(`Met ${d.meetings}× (last ${ago(d.lastMeetingAt)})`);
  if (d.emailsOut || d.emailsIn)
    out.push(
      `${d.emailsOut} email${d.emailsOut === 1 ? "" : "s"} sent, ${d.emailsIn} received (last ${ago(d.lastEmailAt)})`,
    );
  if (d.messages)
    out.push(
      `${d.messages} DMs/LinkedIn messages (last ${ago(d.lastMessageAt)})`,
    );
  if (d.nextMeetingAt)
    out.push(
      `Upcoming meeting ${ago(d.nextMeetingAt)}: ${d.nextMeetingTitle ?? "untitled"}`,
    );
  if (d.inPhone) out.push("In your phone contacts");
  if (d.inContacts) out.push("In your Google contacts");
  if (d.linkedinConnectedOn)
    out.push(`LinkedIn connection since ${d.linkedinConnectedOn.slice(0, 4)}`);
  if (d.xRelation) out.push(`X: ${d.xRelation}`);
  const self = me();
  if (self) {
    for (const w of workedTogether(self.id, personId))
      out.push(
        `You worked together at ${w.company} (${fmtRange(w.from, w.to)})`,
      );
    const shared = sharedCommunities(self.id, personId);
    if (shared.length)
      out.push(`Both in ${shared.map((c) => c.name).join(", ")}`);
  }
  return out;
}

export type Edge = {
  a: string;
  b: string;
  kind: string;
  weight: number;
  evidence: string;
};

/** Human-readable evidence for how two people (neither of them you) know each other. */
export function pairEvidence(
  a: string,
  b: string,
): { lines: string[]; weight: number; confirmed: boolean } {
  const [x, y] = a < b ? [a, b] : [b, a];
  const edges = all<Edge>("SELECT * FROM edges WHERE a = ? AND b = ?", x, y);
  const lines: string[] = [];
  let weight = 0;
  for (const e of edges) {
    const ev = JSON.parse(e.evidence) as Record<string, any>;
    weight += e.weight;
    if (e.kind === "worked_together")
      lines.push(
        `Worked together at ${ev.company} (${fmtRange(ev.from, ev.to)})`,
      );
    else if (e.kind === "same_company")
      lines.push(`Both currently at ${ev.company}`);
    else if (e.kind === "studied_together")
      lines.push(`Overlapped at ${ev.school} (${fmtRange(ev.from, ev.to)})`);
    else if (e.kind === "met_together")
      lines.push(
        `In ${ev.count} meeting${ev.count === 1 ? "" : "s"} together with you (last ${ago(ev.lastAt)}: "${ev.lastSubject ?? ""}")`,
      );
    else if (e.kind === "shared_thread")
      lines.push(
        `On ${ev.count} thread${ev.count === 1 ? "" : "s"} together with you (last ${ago(ev.lastAt)}: "${ev.lastSubject ?? ""}")`,
      );
  }
  const confirmed = weight > 0;
  const shared = sharedCommunities(a, b);
  if (shared.length) {
    lines.push(
      `Both in ${shared.map((c) => c.name).join(", ")} (community context, not proof they know each other)`,
    );
    weight += 0.3 * shared.length;
  }
  return { lines, weight, confirmed };
}

export function neighbors(
  personId: string,
): { id: string; weight: number; kinds: string[] }[] {
  const rows = all<{ other: string; weight: number; kind: string }>(
    `SELECT CASE WHEN a = ? THEN b ELSE a END AS other, weight, kind FROM edges WHERE a = ? OR b = ?`,
    personId,
    personId,
    personId,
  );
  const acc = new Map<
    string,
    { id: string; weight: number; kinds: string[] }
  >();
  for (const r of rows) {
    const v = acc.get(r.other) ?? { id: r.other, weight: 0, kinds: [] };
    v.weight += r.weight;
    v.kinds.push(r.kind);
    acc.set(r.other, v);
  }
  return [...acc.values()].sort((a, b) => b.weight - a.weight);
}

/** People who work (or worked) at a company, by name or domain. */
export function peopleAtCompany(
  company: string,
  includePast = true,
): { person: PersonRow; role: string; current: boolean }[] {
  const key = companyKey(company);
  const domain = company.includes(".") ? company.toLowerCase() : null;
  const rows = all<
    PersonRow & {
      e_title: string | null;
      e_current: number;
      e_start: string | null;
      e_end: string | null;
    }
  >(
    `SELECT p.*, e.title AS e_title, e.is_current AS e_current, e.start_date AS e_start, e.end_date AS e_end
     FROM employment e JOIN people p ON p.id = e.person_id
     WHERE p.hidden = 0 AND p.is_me = 0 AND (e.company_key = ? OR e.company_key LIKE ? OR (? IS NOT NULL AND e.company_domain LIKE ?))
     ORDER BY e.is_current DESC, p.strength DESC`,
    key,
    `${key} %`,
    domain,
    `%${domain ?? ""}%`,
  );
  // Also people whose work email is on the company's domain.
  const byEmail = all<PersonRow>(
    `SELECT DISTINCT p.* FROM identifiers i JOIN people p ON p.id = i.person_id
     WHERE i.kind = 'email' AND p.hidden = 0 AND p.is_me = 0 AND (i.value LIKE ? OR i.value LIKE ?)`,
    `%@${domain ?? key.replace(/\s/g, "")}.%`,
    `%@${domain ?? key.replace(/\s/g, "") + ".com"}`,
  );
  const out = new Map<
    string,
    { person: PersonRow; role: string; current: boolean }
  >();
  for (const r of rows) {
    const current = !!r.e_current || (!r.e_end && !!r.e_start);
    if (!includePast && !current) continue;
    if (out.has(r.id) && (out.get(r.id)!.current || !current)) continue;
    out.set(r.id, {
      person: r,
      role: `${r.e_title ?? "Role unknown"}${current ? "" : ` (${r.e_start?.slice(0, 4) ?? "?"}–${r.e_end?.slice(0, 4) ?? "?"})`}`,
      current,
    });
  }
  for (const p of byEmail)
    if (!out.has(p.id))
      out.set(p.id, {
        person: p,
        role: "work email on company domain",
        current: true,
      });
  return [...out.values()];
}

export type PathHop = {
  from: string;
  to: string;
  evidence: string[];
  confirmed: boolean;
};
export type WarmPath = {
  score: number;
  people: PersonBrief[];
  hops: PathHop[];
  targetRole?: string;
};

/**
 * Warm introduction paths from you to a person or a company:
 * direct (you know them), 2-hop (you → friend → target), then 3-hop if needed.
 * Score multiplies each hop's normalized strength.
 */
export function findWarmPaths(opts: {
  company?: string;
  personId?: string;
  limit?: number;
  includePast?: boolean;
}): WarmPath[] {
  const self = me();
  if (!self) return [];
  const targets: { person: PersonRow; role?: string }[] = opts.personId
    ? [getPerson(opts.personId)]
        .filter((p): p is PersonRow => !!p)
        .map((person) => ({ person }))
    : opts.company
      ? peopleAtCompany(opts.company, opts.includePast ?? true).map((t) => ({
          person: t.person,
          role: t.role,
        }))
      : [];
  const limit = opts.limit ?? 8;
  const paths: WarmPath[] = [];
  const s = (id: string) => (getPerson(id)?.strength ?? 0) / 100;
  const hopStrength = (w: number) => 1 - Math.exp(-w / 2);

  for (const t of targets.slice(0, 60)) {
    const target = t.person;
    if (target.strength >= 10) {
      paths.push({
        score: target.strength / 100,
        people: [brief(self), brief(target)],
        hops: [
          {
            from: self.id,
            to: target.id,
            evidence: myEvidence(target.id),
            confirmed: true,
          },
        ],
        targetRole: t.role,
      });
    }
    for (const n of neighbors(target.id)) {
      const friend = getPerson(n.id);
      if (!friend || friend.is_me || friend.hidden || friend.strength < 10)
        continue;
      const ev = pairEvidence(friend.id, target.id);
      paths.push({
        score: s(friend.id) * hopStrength(ev.weight) * 0.9,
        people: [brief(self), brief(friend), brief(target)],
        hops: [
          {
            from: self.id,
            to: friend.id,
            evidence: myEvidence(friend.id),
            confirmed: true,
          },
          {
            from: friend.id,
            to: target.id,
            evidence: ev.lines,
            confirmed: ev.confirmed,
          },
        ],
        targetRole: t.role,
      });
    }
    // Community-only bridges: a strong tie who shares a community with the target.
    const communityBridges = all<{ person_id: string }>(
      `SELECT DISTINCT m2.person_id FROM memberships m1
       JOIN memberships m2 ON m2.community_id = m1.community_id AND m2.person_id != m1.person_id
       JOIN people p ON p.id = m2.person_id AND p.is_me = 0 AND p.hidden = 0 AND p.strength >= 35
       WHERE m1.person_id = ?`,
      target.id,
    );
    for (const b of communityBridges) {
      if (
        paths.some(
          (p) =>
            p.people.length === 3 &&
            p.people[1].id === b.person_id &&
            p.people[2].id === target.id,
        )
      )
        continue;
      const friend = getPerson(b.person_id)!;
      const ev = pairEvidence(friend.id, target.id);
      paths.push({
        score: s(friend.id) * 0.2,
        people: [brief(self), brief(friend), brief(target)],
        hops: [
          {
            from: self.id,
            to: friend.id,
            evidence: myEvidence(friend.id),
            confirmed: true,
          },
          {
            from: friend.id,
            to: target.id,
            evidence: ev.lines,
            confirmed: false,
          },
        ],
        targetRole: t.role,
      });
    }
  }

  // 3-hop only when 2-hop found little.
  if (paths.length < 3) {
    for (const t of targets.slice(0, 20)) {
      for (const n2 of neighbors(t.person.id).slice(0, 15)) {
        for (const n1 of neighbors(n2.id).slice(0, 15)) {
          const friend = getPerson(n1.id);
          if (
            !friend ||
            friend.is_me ||
            friend.strength < 25 ||
            n1.id === t.person.id
          )
            continue;
          const e1 = pairEvidence(friend.id, n2.id);
          const e2 = pairEvidence(n2.id, t.person.id);
          const mid = getPerson(n2.id)!;
          paths.push({
            score:
              s(friend.id) *
              hopStrength(e1.weight) *
              hopStrength(e2.weight) *
              0.7,
            people: [brief(self), brief(friend), brief(mid), brief(t.person)],
            hops: [
              {
                from: self.id,
                to: friend.id,
                evidence: myEvidence(friend.id),
                confirmed: true,
              },
              {
                from: friend.id,
                to: mid.id,
                evidence: e1.lines,
                confirmed: e1.confirmed,
              },
              {
                from: mid.id,
                to: t.person.id,
                evidence: e2.lines,
                confirmed: e2.confirmed,
              },
            ],
            targetRole: t.role,
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  return paths
    .sort((a, b) => b.score - a.score)
    .filter((p) => {
      const key = p.people.map((x) => x.id).join(">");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((p) => ({ ...p, score: Math.round(p.score * 100) / 100 }));
}
