import { all, get, run, tx } from "../db/index.ts";
import type { Interaction, ObservedPerson, SourceName } from "../model.ts";
import {
  companyKey,
  linkedinSlug,
  looksAutomated,
  nameKey,
  newId,
  normalizeEmail,
  normalizePhone,
  splitName,
  xHandle,
} from "./normalize.ts";

type Ident = { kind: string; value: string };

export function identifiersOf(p: ObservedPerson): Ident[] {
  const ids: Ident[] = [];
  for (const e of p.emails ?? []) {
    const v = normalizeEmail(e);
    if (v && !looksAutomated(v)) ids.push({ kind: "email", value: v });
  }
  for (const ph of p.phones ?? []) {
    const v = normalizePhone(ph);
    if (v) ids.push({ kind: "phone", value: v });
  }
  const li = linkedinSlug(p.linkedinUrl);
  if (li) ids.push({ kind: "linkedin", value: li });
  const xh = xHandle(p.xHandle);
  if (xh) ids.push({ kind: "x_handle", value: xh });
  if (p.xId) ids.push({ kind: "x_id", value: p.xId });
  return ids;
}

function displayNameOf(p: ObservedPerson): string {
  if (p.name?.trim()) return p.name.trim();
  const joined = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (p.xHandle) return `@${xHandle(p.xHandle) ?? p.xHandle}`;
  if (p.xId) return `X account ${p.xId}`;
  return p.emails?.[0] ?? p.phones?.[0] ?? "Unknown";
}

function createPerson(p: ObservedPerson): string {
  const id = newId("p");
  const name = displayNameOf(p);
  const split = splitName(name);
  run(
    "INSERT INTO people (id, display_name, first_name, last_name) VALUES (?, ?, ?, ?)",
    id,
    name,
    p.firstName ?? split.first,
    p.lastName ?? split.last,
  );
  return id;
}

/** Merge person `fromId` into `intoId`, repointing every reference. */
export function mergePeople(fromId: string, intoId: string, reason: string) {
  if (fromId === intoId) return;
  tx(() => {
    const repoint = [
      "UPDATE identifiers SET person_id = ? WHERE person_id = ?",
      "UPDATE observations SET person_id = ? WHERE person_id = ?",
      "UPDATE participants SET person_id = ? WHERE person_id = ?",
      "UPDATE employment SET person_id = ? WHERE person_id = ?",
      "UPDATE education SET person_id = ? WHERE person_id = ?",
      "UPDATE notes SET person_id = ? WHERE person_id = ?",
      "UPDATE OR IGNORE memberships SET person_id = ? WHERE person_id = ?",
      "UPDATE OR IGNORE enrichments SET person_id = ? WHERE person_id = ?",
    ];
    for (const sql of repoint) run(sql, intoId, fromId);
    run("DELETE FROM memberships WHERE person_id = ?", fromId);
    run("DELETE FROM enrichments WHERE person_id = ?", fromId);
    run("DELETE FROM edges WHERE a = ? OR b = ?", fromId, fromId);
    run("DELETE FROM embeddings WHERE person_id IN (?, ?)", fromId, intoId);
    run("DELETE FROM people_fts WHERE person_id = ?", fromId);
    const from = get<{ is_me: number; hidden: number }>(
      "SELECT is_me, hidden FROM people WHERE id = ?",
      fromId,
    );
    if (from?.is_me) run("UPDATE people SET is_me = 1 WHERE id = ?", intoId);
    if (from?.hidden) run("UPDATE people SET hidden = 1 WHERE id = ?", intoId);
    run("DELETE FROM people WHERE id = ?", fromId);
    run("UPDATE people SET updated_at = datetime('now') WHERE id = ?", intoId);
    run(
      "INSERT INTO merges (from_id, into_id, reason) VALUES (?, ?, ?)",
      fromId,
      intoId,
      reason,
    );
  });
}

function oldest(ids: string[]): string {
  const rows = all<{ id: string }>(
    `SELECT id FROM people WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY is_me DESC, created_at, id`,
    ...ids,
  );
  return rows[0]?.id ?? ids[0];
}

export type UpsertOptions = {
  /** Create a new person when no identifier matches. Default true. */
  create?: boolean;
  /** Mark the resolved person as the owner of this brain. */
  isMe?: boolean;
};

/**
 * Store one source record and resolve it to a person: reuse the person any of its
 * identifiers already point at, merge people it proves are the same, or create one.
 */
export function upsertObservation(
  source: SourceName,
  accountId: string,
  externalId: string,
  data: ObservedPerson,
  opts: UpsertOptions = {},
): string | null {
  return tx(() => {
    const idents = identifiersOf(data);
    const matched = new Set<string>();
    for (const i of idents) {
      const hit = get<{ person_id: string }>(
        "SELECT person_id FROM identifiers WHERE kind = ? AND value = ?",
        i.kind,
        i.value,
      );
      if (hit) matched.add(hit.person_id);
    }
    const existing = get<{ person_id: string | null }>(
      "SELECT person_id FROM observations WHERE source = ? AND account_id = ? AND external_id = ?",
      source,
      accountId,
      externalId,
    );
    if (existing?.person_id) matched.add(existing.person_id);

    // All of your own accounts (work Gmail, personal Gmail, X, LinkedIn) are one person.
    if (opts.isMe && matched.size === 0) {
      const self = get<{ id: string }>(
        "SELECT id FROM people WHERE is_me = 1 ORDER BY created_at, id LIMIT 1",
      );
      if (self) matched.add(self.id);
    }

    let personId: string | null = null;
    if (matched.size > 0) {
      const ids = [...matched];
      personId = oldest(ids);
      for (const other of ids)
        if (other !== personId)
          mergePeople(other, personId, `shared identifier via ${source}`);
    } else if (opts.create !== false) {
      personId = createPerson(data);
    }

    if (personId) {
      for (const i of idents) {
        run(
          "INSERT OR IGNORE INTO identifiers (kind, value, person_id, source) VALUES (?, ?, ?, ?)",
          i.kind,
          i.value,
          personId,
          source,
        );
      }
      if (opts.isMe) run("UPDATE people SET is_me = 1 WHERE id = ?", personId);
      run(
        "UPDATE people SET updated_at = datetime('now') WHERE id = ?",
        personId,
      );
    }

    run(
      `INSERT INTO observations (source, account_id, external_id, person_id, data, observed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(source, account_id, external_id)
       DO UPDATE SET person_id = excluded.person_id, data = excluded.data, observed_at = excluded.observed_at`,
      source,
      accountId,
      externalId,
      personId,
      JSON.stringify(data),
    );
    return personId;
  });
}

/** Attach identifiers discovered later (e.g. from enrichment) and merge if they collide. */
export function addIdentifiers(
  personId: string,
  data: ObservedPerson,
  source: string,
) {
  tx(() => {
    for (const i of identifiersOf(data)) {
      const hit = get<{ person_id: string }>(
        "SELECT person_id FROM identifiers WHERE kind = ? AND value = ?",
        i.kind,
        i.value,
      );
      if (!hit) {
        run(
          "INSERT INTO identifiers (kind, value, person_id, source) VALUES (?, ?, ?, ?)",
          i.kind,
          i.value,
          personId,
          source,
        );
      } else if (hit.person_id !== personId) {
        // Only trust enrichment merges on identifiers that are genuinely unique to a human.
        if (
          i.kind === "linkedin" ||
          i.kind === "x_id" ||
          i.kind === "x_handle" ||
          i.kind === "email"
        ) {
          const keep = oldest([personId, hit.person_id]);
          mergePeople(
            keep === personId ? hit.person_id : personId,
            keep,
            `${source} ${i.kind} match`,
          );
          personId = keep;
        }
      }
    }
  });
  return personId;
}

export function saveInteraction(it: Interaction) {
  run(
    `INSERT INTO interactions (id, source, account_id, kind, occurred_at, direction, subject, snippet, thread_id, url, is_bulk, community_id, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       occurred_at = excluded.occurred_at, direction = excluded.direction, subject = excluded.subject,
       snippet = excluded.snippet, is_bulk = excluded.is_bulk, community_id = excluded.community_id, meta = excluded.meta`,
    it.id,
    it.source,
    it.accountId ?? "",
    it.kind,
    it.occurredAt,
    it.direction ?? "none",
    it.subject ?? null,
    it.snippet ?? null,
    it.threadId ?? null,
    it.url ?? null,
    it.isBulk ? 1 : 0,
    it.communityId ?? null,
    JSON.stringify(it.meta ?? {}),
  );
  run("DELETE FROM participants WHERE interaction_id = ?", it.id);
  for (const p of it.participants) {
    const handle =
      p.handleKind === "email" ? normalizeEmail(p.handle) : p.handle;
    if (!handle) continue;
    run(
      "INSERT OR IGNORE INTO participants (interaction_id, handle_kind, handle, name, role) VALUES (?, ?, ?, ?, ?)",
      it.id,
      p.handleKind,
      handle,
      p.name ?? null,
      p.role,
    );
  }
  run("DELETE FROM activity_fts WHERE interaction_id = ?", it.id);
  if (it.subject || it.snippet) {
    run(
      "INSERT INTO activity_fts (interaction_id, subject, body) VALUES (?, ?, ?)",
      it.id,
      it.subject ?? "",
      it.snippet ?? "",
    );
  }
}

/** Attach orphan observations (one-way X follows, other-contacts) once an identifier now matches. */
export function relinkOrphans(): number {
  let linked = 0;
  const orphans = all<{ id: number; data: string }>(
    "SELECT id, data FROM observations WHERE person_id IS NULL",
  );
  tx(() => {
    for (const o of orphans) {
      for (const i of identifiersOf(JSON.parse(o.data))) {
        const hit = get<{ person_id: string }>(
          "SELECT person_id FROM identifiers WHERE kind = ? AND value = ?",
          i.kind,
          i.value,
        );
        if (hit) {
          run(
            "UPDATE observations SET person_id = ? WHERE id = ?",
            hit.person_id,
            o.id,
          );
          for (const j of identifiersOf(JSON.parse(o.data))) {
            run(
              "INSERT OR IGNORE INTO identifiers (kind, value, person_id, source) VALUES (?, ?, ?, 'relink')",
              j.kind,
              j.value,
              hit.person_id,
            );
          }
          linked++;
          break;
        }
      }
    }
  });
  return linked;
}

/** Point participants at people via identifiers. Cheap; run after every sync. */
export function linkParticipants() {
  run(`UPDATE participants SET person_id = (
         SELECT person_id FROM identifiers i
         WHERE i.kind = participants.handle_kind AND i.value = participants.handle)
       WHERE handle_kind IN ('email', 'x_id', 'linkedin')`);
}

export function myPersonIds(): string[] {
  return all<{ id: string }>("SELECT id FROM people WHERE is_me = 1").map(
    (r) => r.id,
  );
}

export function myEmails(): Set<string> {
  return new Set(
    all<{ value: string }>(
      "SELECT i.value FROM identifiers i JOIN people p ON p.id = i.person_id WHERE p.is_me = 1 AND i.kind = 'email'",
    ).map((r) => r.value),
  );
}

/**
 * Merge people who share a full name when nothing contradicts it — mostly LinkedIn/X
 * records (no email/phone) meeting their Gmail/contact twin.
 */
export function resolveByName(): number {
  const people = all<{
    id: string;
    display_name: string;
    company: string | null;
  }>("SELECT id, display_name, company FROM people WHERE is_me = 0");
  const groups = new Map<string, typeof people>();
  for (const p of people) {
    const key = nameKey(p.display_name);
    if (key.split(" ").length < 2) continue;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2 || group.length > 3) continue;
    const idents = new Map(
      group.map((p) => [
        p.id,
        all<{ kind: string; value: string }>(
          "SELECT kind, value FROM identifiers WHERE person_id = ?",
          p.id,
        ),
      ]),
    );
    const hasContactable = (id: string) =>
      idents.get(id)!.some((i) => i.kind === "email" || i.kind === "phone");
    const conflict = (a: string, b: string) =>
      ["linkedin", "x_id"].some((kind) => {
        const va = idents
          .get(a)!
          .filter((i) => i.kind === kind)
          .map((i) => i.value);
        const vb = idents
          .get(b)!
          .filter((i) => i.kind === kind)
          .map((i) => i.value);
        return (
          va.length > 0 && vb.length > 0 && !va.some((v) => vb.includes(v))
        );
      });
    const companiesAgree = (a: (typeof group)[0], b: (typeof group)[0]) => {
      const ka = companyKey(a.company);
      const kb = companyKey(b.company);
      if (ka && kb) return ka === kb || ka.includes(kb) || kb.includes(ka);
      const domains = (id: string) =>
        idents
          .get(id)!
          .filter((i) => i.kind === "email")
          .map((i) => i.value.split("@")[1].split(".")[0]);
      const k = ka || kb;
      const other = ka ? b.id : a.id;
      return (
        !!k &&
        domains(other).some(
          (d) =>
            k.replace(/\s/g, "").includes(d) ||
            d.includes(k.replace(/\s/g, "")),
        )
      );
    };
    const [first, ...rest] = group;
    for (const other of rest) {
      if (conflict(first.id, other.id)) continue;
      const oneIsNameOnly =
        !hasContactable(first.id) || !hasContactable(other.id);
      if (
        companiesAgree(first, other) ||
        (group.length === 2 && oneIsNameOnly)
      ) {
        const keep = oldest([first.id, other.id]);
        mergePeople(
          keep === first.id ? other.id : first.id,
          keep,
          "same name, no conflicting identifiers",
        );
        first.id = keep;
        merged++;
      }
    }
  }
  return merged;
}
