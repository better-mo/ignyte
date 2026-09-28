import { all, run, tx } from "../db/index.ts";
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
export function promoteAddresses(log = console.log): number {
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
