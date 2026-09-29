import { all, run, tx } from "../db/index.ts";
import { looksAutomated, ROOM_NAME } from "./normalize.ts";
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

/** Hide records that are rooms, calendars or robots rather than people (reversible from the UI). */
export function hideNonPeople(): number {
  const rows = all<{ id: string; display_name: string; emails: string | null; others: number }>(
    `SELECT p.id, p.display_name,
            (SELECT group_concat(value, ' ') FROM identifiers i WHERE i.person_id = p.id AND i.kind = 'email') AS emails,
            (SELECT COUNT(*) FROM identifiers i WHERE i.person_id = p.id AND i.kind != 'email') AS others
     FROM people p WHERE p.is_me = 0 AND p.hidden = 0`,
  );
  let hidden = 0;
  tx(() => {
    for (const r of rows) {
      const emails = r.emails?.split(" ") ?? [];
      const robot = emails.length > 0 && !r.others && emails.every(looksAutomated);
      if (robot || ROOM_NAME.test(r.display_name)) {
        run("UPDATE people SET hidden = 1 WHERE id = ?", r.id);
        hidden++;
      }
    }
  });
  return hidden;
}

export function promoteAddresses(log = console.log): number {
  const demoted = demoteBroadcastLists();
  const rooms = hideNonPeople();
  if (rooms) log(`  hid ${rooms} rooms, calendars and robot addresses`);
  if (demoted)
    log(`  lists: ${demoted} newsletter-style lists treated as bulk mail`);
  linkParticipants();
  const mine = myEmails();
  const now = new Date().toISOString();
  const candidates = all<{
    email: string;
    name: string | null;
    sent_to: number;
    replied: number;
    meetings: number;
    posts: number;
  }>(
    `SELECT pa.handle AS email, MAX(pa.name) AS name,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'out' AND pa.role IN ('to', 'cc') THEN 1 ELSE 0 END) AS sent_to,
       SUM(CASE WHEN i.kind = 'email' AND i.direction = 'in' AND pa.role = 'from' AND i.is_bulk = 0
                 AND i.thread_id IN (SELECT thread_id FROM interactions WHERE direction = 'out' AND thread_id IS NOT NULL)
            THEN 1 ELSE 0 END) AS replied,
       SUM(CASE WHEN i.kind = 'meeting' AND i.occurred_at <= ? THEN 1 ELSE 0 END) AS meetings,
       SUM(CASE WHEN i.kind = 'community_post' AND pa.role = 'from' THEN 1 ELSE 0 END) AS posts
     FROM participants pa JOIN interactions i ON i.id = pa.interaction_id
     WHERE pa.handle_kind = 'email' AND pa.person_id IS NULL
     GROUP BY pa.handle`,
    now,
  );
  let created = 0;
  tx(() => {
    for (const c of candidates) {
      if (mine.has(c.email) || looksAutomated(c.email)) continue;
      if (c.sent_to + c.replied + c.meetings + c.posts === 0) continue;
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
