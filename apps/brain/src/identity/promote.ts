import { all, run, tx } from "../db/index.ts";
import { automatedAddressReason, looksLikePerson } from "./automated.ts";
import { looksAutomated } from "./normalize.ts";
import {
  linkParticipants,
  myEmails,
  myPersonIds,
  upsertObservation,
} from "./store.ts";

/**
 * Turn raw email/calendar addresses into people only when there's real signal:
 * you wrote to them, they replied in a thread you're part of, you met, or they
 * posted in a community mailing list you're on. Newsletters and cold inbound stay out.
 */
/** A discussion list has several people posting; a newsletter has one or two senders. */
const MIN_LIST_POSTERS = 3;

/**
 * Turn "lists" that are really newsletters/marketing (List-Id header, but only 1–2
 * senders) back into bulk mail, and drop people who only existed because of them.
 */
export function demoteBroadcastLists(): number {
  const broadcast = all<{ community_id: string }>(
    `SELECT i.community_id FROM interactions i
     LEFT JOIN participants pa ON pa.interaction_id = i.id AND pa.role = 'from'
     WHERE i.community_id LIKE 'list:%'
     GROUP BY i.community_id HAVING COUNT(DISTINCT pa.handle) < ?`,
    MIN_LIST_POSTERS,
  ).map((r) => r.community_id);
  tx(() => {
    for (const id of broadcast) {
      run(
        "UPDATE interactions SET kind = 'email', is_bulk = 1, community_id = NULL WHERE community_id = ?",
        id,
      );
      run("DELETE FROM memberships WHERE community_id = ?", id);
      run("DELETE FROM communities WHERE id = ?", id);
    }
    // People whose only record is "posted to a list" and who belong to no community.
    const orphans = all<{ id: string }>(
      `SELECT p.id FROM people p
       WHERE p.is_me = 0
         AND EXISTS (SELECT 1 FROM observations o WHERE o.person_id = p.id AND o.source = 'community' AND o.account_id = '')
         AND NOT EXISTS (SELECT 1 FROM observations o WHERE o.person_id = p.id AND NOT (o.source = 'community' AND o.account_id = ''))
         AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.person_id = p.id)`,
    ).map((r) => r.id);
    for (const id of orphans) {
      run("UPDATE participants SET person_id = NULL WHERE person_id = ?", id);
      for (const table of [
        "identifiers",
        "observations",
        "employment",
        "education",
        "enrichments",
        "notes",
        "embeddings",
        "people_fts",
      ]) {
        run(`DELETE FROM ${table} WHERE person_id = ?`, id);
      }
      run("DELETE FROM edges WHERE a = ? OR b = ?", id, id);
      run("DELETE FROM people WHERE id = ?", id);
    }
  });
  return broadcast.length;
}

type SenderStats = {
  key: string;
  inbound: number; // emails they sent you
  inbound_bulk: number; // …of which bulk / notification-style
  direct_out: number; // emails you sent them directly (To:, small recipient list)
  cc_out: number; // emails you only cc'd them on
  replied: number; // non-bulk replies from them in threads you wrote in
  meetings: number; // past meetings of ≤ 25 people
  posts: number; // community list posts
};

/** How you and an address (or a person) actually exchange mail: the behavioural layer. */
function senderStats(by: "handle" | "person"): SenderStats[] {
  const col = by === "handle" ? "pa.handle" : "pa.person_id";
  const filter =
    by === "handle"
      ? "pa.handle_kind = 'email' AND pa.person_id IS NULL"
      : "pa.person_id IS NOT NULL";
  return all<SenderStats>(
    `WITH n AS (SELECT interaction_id, COUNT(*) AS c FROM participants GROUP BY interaction_id)
     SELECT ${col} AS key,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'in' AND pa.role = 'from' THEN 1 ELSE 0 END) AS inbound,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'in' AND pa.role = 'from'
                 AND (i.is_bulk = 1 OR json_extract(i.meta, '$.category') = 'updates') THEN 1 ELSE 0 END) AS inbound_bulk,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'out' AND pa.role = 'to' AND n.c <= 11 THEN 1 ELSE 0 END) AS direct_out,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'out' AND pa.role = 'cc' THEN 1 ELSE 0 END) AS cc_out,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'in' AND pa.role = 'from' AND i.is_bulk = 0
                 AND COALESCE(json_extract(i.meta, '$.category'), '') != 'updates'
                 AND i.thread_id IN (SELECT thread_id FROM interactions WHERE direction = 'out' AND thread_id IS NOT NULL)
            THEN 1 ELSE 0 END) AS replied,
       SUM(CASE WHEN i.kind = 'meeting' AND i.occurred_at <= datetime('now') AND n.c <= 25 THEN 1 ELSE 0 END) AS meetings,
       SUM(CASE WHEN i.kind = 'community_post' AND pa.role = 'from' THEN 1 ELSE 0 END) AS posts
     FROM participants pa JOIN interactions i ON i.id = pa.interaction_id JOIN n ON n.interaction_id = i.id
     WHERE ${filter}
     GROUP BY ${col}`,
  );
}

/** Mostly bulk/notification mail and you've never written to them or met: a machine. */
export function isMachineSender(s: Omit<SenderStats, "key">): boolean {
  return (
    s.inbound >= 3 &&
    s.inbound_bulk / s.inbound >= 0.8 &&
    s.direct_out === 0 &&
    s.meetings === 0
  );
}

/** Enough two-way signal to create a person from a bare address. */
export function worthPromoting(s: Omit<SenderStats, "key">): boolean {
  if (isMachineSender(s)) return false;
  // Being cc'd, or one stray reply in a notification thread, isn't a relationship.
  return s.direct_out >= 1 || s.meetings >= 1 || s.posts >= 1 || s.replied >= 2;
}

/**
 * Re-check every visible person with the current rules and hide the ones that aren't
 * human (reversible: restoring one marks it "keep" and it's never auto-hidden again).
 * People hidden by an older rule that no longer applies come back.
 */
export function hideNonPeople(): { hidden: number; restored: number } {
  const stats = new Map(senderStats("person").map((s) => [s.key, s]));
  const people = all<{
    id: string;
    display_name: string;
    hidden: number;
    hidden_reason: string | null;
    emails: string | null;
    linkedin: number;
    phones: number;
  }>(
    `SELECT p.id, p.display_name, p.hidden, p.hidden_reason,
       (SELECT group_concat(value, ' ') FROM identifiers i WHERE i.person_id = p.id AND i.kind = 'email') AS emails,
       (SELECT COUNT(*) FROM identifiers i WHERE i.person_id = p.id AND i.kind = 'linkedin') AS linkedin,
       (SELECT COUNT(*) FROM identifiers i WHERE i.person_id = p.id AND i.kind = 'phone') AS phones
     FROM people p
     WHERE p.is_me = 0 AND COALESCE(p.hidden_reason, '') != 'keep'
       AND (p.hidden = 0 OR p.hidden_reason LIKE 'auto:%')`,
  );
  let hidden = 0;
  let restored = 0;
  tx(() => {
    for (const p of people) {
      const emails = p.emails?.split(" ").filter(Boolean) ?? [];
      const s = stats.get(p.id);
      // Addresses that belong to a service, not this person, are detached from them.
      for (const e of emails.filter(looksAutomated))
        run("DELETE FROM identifiers WHERE kind = 'email' AND value = ?", e);
      const human = emails.filter((e) => !looksAutomated(e));
      // Things only a person has: a LinkedIn profile, a real meeting, mail you wrote to them.
      const vouched = p.linkedin > 0 || (s?.meetings ?? 0) > 0 || (s?.direct_out ?? 0) > 0;
      let reason: string | null = null;
      if (emails.length && !human.length && !p.linkedin && !p.phones)
        reason = automatedAddressReason(emails[0]) ?? "automated address";
      else if (!looksLikePerson(p.display_name) && !p.linkedin)
        reason = "name of an organisation, inbox or room";
      else if (!vouched && s && isMachineSender(s)) reason = "only sends automated mail";
      if (reason && !p.hidden) {
        run("UPDATE people SET hidden = 1, hidden_reason = ? WHERE id = ?", `auto: ${reason}`, p.id);
        hidden++;
      } else if (!reason && p.hidden) {
        run("UPDATE people SET hidden = 0, hidden_reason = NULL WHERE id = ?", p.id);
        restored++;
      }
    }
  });
  return { hidden, restored };
}

export function promoteAddresses(log = console.log): number {
  const demoted = demoteBroadcastLists();

  if (demoted)
    log(`  lists: ${demoted} newsletter-style lists treated as bulk mail`);
  linkParticipants();
  const mine = myEmails();
  const names = new Map(
    all<{ handle: string; name: string | null }>(
      "SELECT handle, MAX(name) AS name FROM participants WHERE handle_kind = 'email' AND person_id IS NULL GROUP BY handle",
    ).map((r) => [r.handle, r.name]),
  );
  const candidates = senderStats("handle").map((s) => ({
    ...s,
    email: s.key,
    name: names.get(s.key) ?? null,
    sent_to: s.direct_out + s.cc_out,
  }));
  let created = 0;
  tx(() => {
    for (const c of candidates) {
      if (mine.has(c.email) || looksAutomated(c.email)) continue;
      if (!worthPromoting(c)) continue;
      const source =
        c.sent_to + c.replied > 0
          ? "gmail"
          : c.meetings > 0
            ? "calendar"
            : "community";
      upsertObservation(source, "", c.email, {
        name: c.name ?? undefined,
        emails: [c.email],
      });
      created++;
    }
  });
  linkParticipants();

  // Mailing-list posters are members of that community; so am I if the list reaches me.
  run(
    `INSERT OR IGNORE INTO memberships (community_id, person_id, role, source)
     SELECT DISTINCT i.community_id, pa.person_id, 'member', 'email_list'
     FROM interactions i JOIN participants pa ON pa.interaction_id = i.id
     WHERE i.community_id IS NOT NULL AND pa.role = 'from' AND pa.person_id IS NOT NULL`,
  );
  for (const me of myPersonIds()) {
    run(
      `INSERT OR IGNORE INTO memberships (community_id, person_id, role, source)
       SELECT DISTINCT community_id, ?, 'member', 'email_list' FROM interactions
       WHERE community_id IS NOT NULL AND source = 'gmail'`,
      me,
    );
  }
  log(`  promoted ${created} email/calendar addresses to people`);
  return created;
}
