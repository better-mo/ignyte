import { all, run, tx } from "../db/index.ts";

const DAY = 864e5;
const HALF_LIFE_DAYS = 365;

type Touch = {
  person_id: string;
  kind: string;
  direction: string;
  role: string;
  occurred_at: string;
  is_bulk: number;
  n: number; // participant count
  subject: string | null;
};

export type StrengthDetail = {
  emailsOut: number;
  emailsIn: number;
  meetings: number;
  messages: number;
  lastEmailAt?: string;
  lastMeetingAt?: string;
  lastMessageAt?: string;
  nextMeetingAt?: string;
  nextMeetingTitle?: string;
  inContacts: boolean;
  inPhone: boolean;
  linkedinConnectedOn?: string;
  xRelation?: string;
  recent90: number;
  prior90: number;
  score: number;
};

/**
 * Relationship strength (0–100) from how, how often, how recently and how mutually
 * you interact. Meetings and direct replies weigh most; mass mail barely counts.
 */
export function computeStrength() {
  const now = Date.now();
  const touches = all<Touch>(
    `SELECT pa.person_id, i.kind, i.direction, pa.role, i.occurred_at, i.is_bulk, i.subject,
            (SELECT COUNT(*) FROM participants x WHERE x.interaction_id = i.id) AS n
     FROM participants pa
     JOIN interactions i ON i.id = pa.interaction_id
     JOIN people p ON p.id = pa.person_id
     WHERE p.is_me = 0 AND i.occurred_at > '1990'`,
  );
  const sources = all<{ person_id: string; source: string; data: string }>(
    "SELECT person_id, source, data FROM observations WHERE person_id IS NOT NULL AND source IN ('google_contacts', 'phone', 'linkedin')",
  );

  const detail = new Map<
    string,
    StrengthDetail & {
      raw: number;
      out: boolean;
      in: boolean;
      lastAt?: string;
      firstAt?: string;
      count: number;
    }
  >();
  const d = (id: string) => {
    let v = detail.get(id);
    if (!v) {
      v = {
        emailsOut: 0,
        emailsIn: 0,
        meetings: 0,
        messages: 0,
        inContacts: false,
        inPhone: false,
        recent90: 0,
        prior90: 0,
        score: 0,
        raw: 0,
        out: false,
        in: false,
        count: 0,
      };
      detail.set(id, v);
    }
    return v;
  };

  for (const s of sources) {
    const v = d(s.person_id);
    if (s.source === "google_contacts") v.inContacts = true;
    if (s.source === "phone") v.inPhone = true;
    if (s.source === "linkedin") {
      const data = JSON.parse(s.data) as { connectedOn?: string };
      if (data.connectedOn) v.linkedinConnectedOn = data.connectedOn;
    }
  }

  for (const t of touches) {
    const v = d(t.person_id);
    const at = Date.parse(t.occurred_at);
    const future = at > now;
    if (t.kind === "follow") {
      v.xRelation =
        t.direction === "mutual"
          ? "mutual follow"
          : t.direction === "out"
            ? "you follow"
            : "follows you";
      v.raw += t.direction === "mutual" ? 4 : 1;
      continue;
    }
    if (t.kind === "connected") {
      v.raw += 4;
      continue;
    }
    if (t.kind === "community_post" || t.kind === "event" || t.is_bulk)
      continue;
    if (future) {
      if (
        t.kind === "meeting" &&
        (!v.nextMeetingAt || t.occurred_at < v.nextMeetingAt)
      ) {
        v.nextMeetingAt = t.occurred_at;
        v.nextMeetingTitle = t.subject ?? undefined;
      }
      continue;
    }

    let w = 0;
    const crowd = Math.max(1, t.n - 1);
    if (t.kind === "email") {
      if (t.direction === "out" && t.role === "to")
        ((w = 3), v.emailsOut++, (v.out = true));
      else if (t.direction === "out" && t.role === "cc")
        ((w = 1.5), v.emailsOut++, (v.out = true));
      else if (t.direction === "in" && t.role === "from")
        ((w = 2), v.emailsIn++, (v.in = true));
      else w = 0.5;
      w /= Math.sqrt(crowd);
      if (!v.lastEmailAt || t.occurred_at > v.lastEmailAt)
        v.lastEmailAt = t.occurred_at;
    } else if (t.kind === "meeting") {
      w = 8 / Math.sqrt(crowd);
      v.meetings++;
      v.out = v.in = true;
      if (!v.lastMeetingAt || t.occurred_at > v.lastMeetingAt)
        v.lastMeetingAt = t.occurred_at;
    } else if (t.kind === "dm" || t.kind === "linkedin_message") {
      const mineSent = t.direction === "out";
      w = (mineSent ? 3 : 2) / Math.sqrt(crowd);
      v.messages++;
      if (mineSent) v.out = true;
      else v.in = true;
      if (!v.lastMessageAt || t.occurred_at > v.lastMessageAt)
        v.lastMessageAt = t.occurred_at;
    }
    const ageDays = (now - at) / DAY;
    v.raw += w * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    v.count++;
    if (ageDays <= 90) v.recent90 += w;
    else if (ageDays <= 180) v.prior90 += w;
    if (!v.lastAt || t.occurred_at > v.lastAt) v.lastAt = t.occurred_at;
    if (!v.firstAt || t.occurred_at < v.firstAt) v.firstAt = t.occurred_at;
  }

  tx(() => {
    run(
      "UPDATE people SET strength = 0, tier = NULL, trend = NULL, strength_detail = NULL, interaction_count = 0 WHERE is_me = 0",
    );
    for (const [id, v] of detail) {
      let raw = v.raw + (v.inContacts ? 6 : 0) + (v.inPhone ? 8 : 0);
      if (v.out && v.in) raw *= 1.3;
      const score = Math.round(100 * (1 - Math.exp(-raw / 25)));
      v.score = score;
      const lastAge = v.lastAt ? (now - Date.parse(v.lastAt)) / DAY : Infinity;
      const tier =
        score >= 80
          ? "Inner circle"
          : score >= 60
            ? "Close"
            : score >= 35
              ? "Active"
              : score >= 12
                ? "Acquaintance"
                : "Weak tie";
      const trend = !v.lastAt
        ? null
        : lastAge > 365
          ? "dormant"
          : v.recent90 > v.prior90 * 1.5 + 1
            ? "warming"
            : v.prior90 > v.recent90 * 1.5 + 1
              ? "cooling"
              : "steady";
      const { raw: _r, out: _o, in: _i, lastAt, firstAt, count, ...rest } = v;
      run(
        `UPDATE people SET strength = ?, tier = ?, trend = ?, strength_detail = ?, last_interaction_at = ?, first_interaction_at = ?, interaction_count = ?
         WHERE id = ?`,
        score,
        tier,
        trend,
        JSON.stringify(rest),
        lastAt ?? null,
        firstAt ?? null,
        count,
        id,
      );
    }
  });
  return detail.size;
}
