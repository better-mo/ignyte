import { all, get, run, tx } from "../db/index.ts";
import type { ObservedPerson, Position, School } from "../model.ts";
import type { EnrichedProfile } from "../enrich/types.ts";
import { companyKey, linkedinUrl, schoolKey, splitName } from "./normalize.ts";
import { resolveCompany } from "../companies/index.ts";

// Which source to believe first for each kind of field.
const NAME_PRIORITY = [
  "me",
  "manual",
  "google_contacts",
  "phone",
  "linkedin",
  "community",
  "x",
  "gmail",
  "calendar",
  "google_other_contacts",
];
const JOB_PRIORITY = [
  "me",
  "manual",
  "linkedin",
  "google_contacts",
  "phone",
  "community",
  "x",
];
const PLACE_PRIORITY = [
  "me",
  "manual",
  "google_contacts",
  "phone",
  "linkedin",
  "x",
];

type Obs = { source: string; data: ObservedPerson };

const firstOf = <T>(
  obs: Obs[],
  priority: string[],
  pick: (d: ObservedPerson) => T | undefined | null | "",
): T | undefined => {
  const sorted = [...obs].sort(
    (a, b) => rank(priority, a.source) - rank(priority, b.source),
  );
  for (const o of sorted) {
    const v = pick(o.data);
    if (v) return v;
  }
  return undefined;
};
const rank = (priority: string[], s: string) => {
  const i = priority.indexOf(s);
  return i < 0 ? priority.length : i;
};

/** "Toronto, Ontario, Canada" -> parts */
function splitLocation(loc?: string) {
  if (!loc) return {};
  const parts = loc
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const city = parts[0]
    ?.replace(/\s+(Bay|Metropolitan|Greater)?\s*Area$/i, "")
    .replace(/^Greater\s+/i, "");
  return {
    city,
    region: parts.length > 2 ? parts[1] : undefined,
    country: parts.length > 1 ? parts[parts.length - 1] : undefined,
  };
}

/** Drop non-string values (e.g. `true` placeholders from locked PDL fields) saved earlier. */
function sanitizeEnriched(e: any): EnrichedProfile {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const out: any = {};
  for (const [k, v] of Object.entries(e ?? {})) {
    if (k === "positions")
      out.positions = (Array.isArray(v) ? v : [])
        .filter((p: any) => s(p?.company))
        .map((p: any) => ({
          company: p.company,
          domain: s(p.domain),
          title: s(p.title),
          start: s(p.start),
          end: s(p.end),
          current: p.current === true,
        }));
    else if (k === "schools")
      out.schools = (Array.isArray(v) ? v : [])
        .filter((x: any) => s(x?.school))
        .map((x: any) => ({
          school: x.school,
          degree: s(x.degree),
          start: s(x.start),
          end: s(x.end),
        }));
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string");
    else out[k] = s(v);
  }
  return out;
}

/** Recompute a person's display fields, jobs and schools from everything we know. */
export function rebuildPerson(personId: string) {
  const obs = all<{ source: string; data: string }>(
    "SELECT source, data FROM observations WHERE person_id = ?",
    personId,
  ).map((r) => ({
    source: r.source,
    data: JSON.parse(r.data) as ObservedPerson,
  }));
  const enrichedRow = get<{ data: string; provider: string }>(
    "SELECT data, provider FROM enrichments WHERE person_id = ? AND status = 'matched' ORDER BY fetched_at DESC LIMIT 1",
    personId,
  );
  const en: EnrichedProfile | undefined = enrichedRow
    ? sanitizeEnriched(JSON.parse(enrichedRow.data))
    : undefined;
  const ids = all<{ kind: string; value: string }>(
    "SELECT kind, value FROM identifiers WHERE person_id = ?",
    personId,
  );
  const person = get<{ display_name: string; is_me: number }>(
    "SELECT display_name, is_me FROM people WHERE id = ?",
    personId,
  );
  if (!person) return;

  const name =
    firstOf(obs, NAME_PRIORITY, (d) =>
      d.name?.includes("@")
        ? undefined
        : d.name || [d.firstName, d.lastName].filter(Boolean).join(" "),
    ) ||
    en?.fullName ||
    person.display_name;
  const split = splitName(name);

  // Enrichment is usually freshest for current role and location; source data fills gaps.
  const title = en?.title || firstOf(obs, JOB_PRIORITY, (d) => d.title);
  const company = en?.company || firstOf(obs, JOB_PRIORITY, (d) => d.company);
  const loc = splitLocation(firstOf(obs, PLACE_PRIORITY, (d) => d.location));
  const city =
    en?.city || firstOf(obs, PLACE_PRIORITY, (d) => d.city) || loc.city;
  const region =
    en?.region || firstOf(obs, PLACE_PRIORITY, (d) => d.region) || loc.region;
  const country =
    en?.country ||
    firstOf(obs, PLACE_PRIORITY, (d) => d.country) ||
    loc.country;
  const li = ids.find((i) => i.kind === "linkedin")?.value;
  const xh = ids.find((i) => i.kind === "x_handle")?.value;
  const headline =
    en?.headline ||
    firstOf(obs, JOB_PRIORITY, (d) => d.headline) ||
    (title && company ? `${title} at ${company}` : title || company || null);
  const summary =
    en?.summary || firstOf(obs, ["me", "linkedin", "x"], (d) => d.bio) || null;
  const photo =
    firstOf(obs, ["google_contacts", "phone"], (d) => d.photoUrl) ||
    en?.photoUrl ||
    null;

  tx(() => {
    run(
      `UPDATE people SET display_name = ?, first_name = ?, last_name = ?, headline = ?, title = ?, company = ?,
         city = ?, region = ?, country = ?, photo_url = ?, linkedin_url = ?, x_handle = ?, summary = ?, updated_at = datetime('now')
       WHERE id = ?`,
      name,
      firstOf(obs, NAME_PRIORITY, (d) => d.firstName) || split.first,
      firstOf(obs, NAME_PRIORITY, (d) => d.lastName) || split.last,
      headline ?? null,
      title ?? null,
      company ?? null,
      city ?? null,
      region ?? null,
      country ?? null,
      photo,
      li ? linkedinUrl(li) : null,
      xh ?? null,
      summary,
      personId,
    );

    // Jobs: dated enrichment history first, then source-reported roles for companies not yet covered.
    run("DELETE FROM employment WHERE person_id = ?", personId);
    const jobs: (Position & { source: string })[] = [
      ...(en?.positions ?? []).map((p) => ({
        ...p,
        source: `enrichment:${enrichedRow!.provider}`,
      })),
      ...obs.flatMap((o) =>
        (o.data.positions ?? []).map((p) => ({ ...p, source: o.source })),
      ),
    ];
    const seen = new Set<string>();
    for (const j of jobs) {
      const key = companyKey(j.company);
      if (!key) continue;
      const dedupe = `${key}|${(j.title ?? "").toLowerCase()}`;
      if (seen.has(dedupe) || (!j.start && seen.has(key))) continue;
      seen.add(dedupe);
      seen.add(key);
      run(
        `INSERT INTO employment (person_id, company, company_key, company_domain, company_id, title, start_date, end_date, is_current, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        personId,
        j.company,
        key,
        j.domain ?? null,
        resolveCompany(j.company, j.domain, j.source),
        j.title ?? null,
        j.start ?? null,
        j.end ?? null,
        j.current || (!j.end && !!j.start) ? 1 : 0,
        j.source,
      );
    }

    run("DELETE FROM education WHERE person_id = ?", personId);
    const schools: (School & { source: string })[] = [
      ...(en?.schools ?? []).map((s) => ({ ...s, source: "enrichment" })),
      ...obs.flatMap((o) =>
        (o.data.schools ?? []).map((s) => ({ ...s, source: o.source })),
      ),
    ];
    const seenSchools = new Set<string>();
    for (const s of schools) {
      const key = schoolKey(s.school);
      if (!key || seenSchools.has(key)) continue;
      seenSchools.add(key);
      run(
        "INSERT INTO education (person_id, school, school_key, degree, start_date, end_date, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
        personId,
        s.school,
        key,
        s.degree ?? null,
        s.start ?? null,
        s.end ?? null,
        s.source,
      );
    }
  });
}

export function rebuildAllPeople() {
  const ids = all<{ id: string }>("SELECT id FROM people").map((r) => r.id);
  tx(() => ids.forEach(rebuildPerson));
  return ids.length;
}
