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

// Layer sizes (cumulative) and the score each layer starts at.
const LAYERS = [
  { rank: 15, score: 80 }, // Inner circle
  { rank: 50, score: 60 }, // Close
  { rank: 150, score: 35 }, // Active
  { rank: 500, score: 12 }, // Acquaintance
];
// Minimum raw weight to reach each layer: the old absolute curve 100·(1−e^(−raw/25)).
const rawForScore = (score: number) => -25 * Math.log(1 - score / 100);

/**
 * Map raw interaction weight to 0–100 so that the Nth strongest relationship lands on
 * each layer boundary (e.g. #15 scores 80), never below the absolute floor for that
 * score. Piecewise linear in log(raw) between the anchors, so order is preserved.
 */
export function strengthScale(raws: number[]): (raw: number) => number {
  const sorted = raws.filter((r) => r > 0).sort((a, b) => b - a);
  const max = Math.max(sorted[0] ?? 0, rawForScore(99));
  const anchors: { raw: number; score: number }[] = [{ raw: max, score: 100 }];
  for (const l of LAYERS) {
    const atRank = sorted[l.rank - 1] ?? 0;
    const raw = Math.min(
      anchors.at(-1)!.raw * 0.999,
      Math.max(atRank, rawForScore(l.score)),
    );
    anchors.push({ raw, score: l.score });
  }
  anchors.push({ raw: 0, score: 0 });
  const f = (r: number) => Math.log1p(r);
  return (raw: number) => {
    if (raw <= 0) return 0;
    if (raw >= max) return 100;
    for (let i = 1; i < anchors.length; i++) {
      const hi = anchors[i - 1];
      const lo = anchors[i];
      if (raw >= lo.raw) {
        const t = (f(raw) - f(lo.raw)) / (f(hi.raw) - f(lo.raw) || 1);
        // Floor, so only people at or above an anchor reach that layer's score.
        return Math.floor(lo.score + t * (hi.score - lo.score));
      }
    }
    return 0;
  };
}

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

  // Tiers follow the layers of human closeness (about 15 / 50 / 150 / 500 people) rather than
  // a fixed score, so a busy inbox doesn't put 200 people in your "inner circle". A raw
  // floor per tier keeps a small or new network from being inflated.
  const rawOf = (v: { raw: number; inContacts: boolean; inPhone: boolean; out: boolean; in: boolean }) => {
    const r = v.raw + (v.inContacts ? 6 : 0) + (v.inPhone ? 8 : 0);
    return v.out && v.in ? r * 1.3 : r;
  };
  const scale = strengthScale([...detail.values()].map(rawOf));

  tx(() => {
    run(
      "UPDATE people SET strength = 0, tier = NULL, trend = NULL, strength_detail = NULL, interaction_count = 0 WHERE is_me = 0",
    );
    for (const [id, v] of detail) {
      const score = scale(rawOf(v));
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
