import { all, get, run, setMeta, tx } from "../db/index.ts";
import { domainOf, isFreeMail } from "../identity/normalize.ts";
import { myEmails, myPersonIds } from "../identity/store.ts";
import { ensureCommunity } from "../sources/communities.ts";
import {
  knownByAddress,
  knownByLuma,
  knownByMobilize,
  knownByName,
  type CommunityType,
  type KnownCommunity,
} from "./catalog.ts";

export type Addr = { email: string; name?: string };
export type DetectMessage = {
  id: string;
  from: Addr;
  to: Addr[];
  cc: Addr[];
  subject: string;
  snippet: string;
  listId?: { id: string; name: string } | null;
  occurredAt: string;
};

export type SignalKind =
  | "host"
  | "speaker"
  | "post"
  | "registered"
  | "invite"
  | "message";

export type Signal = {
  key: string; // candidate key (known community key, or platform:slug)
  name: string;
  platform: string;
  type: CommunityType;
  url?: string;
  group?: string;
  kind: SignalKind;
  occurredAt: string;
  subject: string;
  poster?: string;
};

const WEIGHT: Record<SignalKind, number> = {
  host: 10,
  speaker: 8,
  post: 8,
  registered: 4,
  invite: 2,
  message: 1,
};

export type Context = {
  mine: Set<string>;
  /** Your own work domains (not gmail.com): mail to colleagues there isn't yours. */
  myDomains: Set<string>;
};

export function contextFromDb(): Context {
  const mine = myEmails();
  const myDomains = new Set(
    [...mine].map(domainOf).filter((d) => d && !isFreeMail(d)),
  );
  return { mine, myDomains };
}

const HOST = /\b(you('| a)re (hosting|a (co-?)?host)|you('ve| have) been added as a (co-?)?host|co-?host(ing)? (invite|request)|your event\b)/i;
const SPEAKER = /\b(you('| a)re (speaking|a speaker|on the panel)|speaker (confirmed|details|brief|prep|invite)|your (talk|session)\b)/i;
const REGISTERED =
  /\b(you('| a)re (registered|going|in|on the list|confirmed)|registration (confirmed|approved|received)|you('ve| have) (registered|been approved)|your (ticket|tickets|registration|rsvp)|rsvp confirmed|see you (there|tonight|tomorrow|soon)|is starting (tomorrow|today|soon|in \d+ ?(hour|hr|min))|starts (tomorrow|today|in \d+)|thanks? (you )?for (joining|attending|coming)|thank you for (joining|attending|coming))\b/i;
const NEWSLETTER = /@(substack|beehiiv|convertkit|mailchimp|ghost)\./i;

function kindOf(subject: string, snippet: string): SignalKind {
  const text = `${subject} ${snippet}`;
  if (HOST.test(text)) return "host";
  if (SPEAKER.test(text)) return "speaker";
  if (REGISTERED.test(text)) return "registered";
  return "message";
}

const titleCase = (s: string) =>
  s
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
const clean = (s?: string) =>
  (s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^"|"$/g, "")
    .trim();

/** Event title from a Luma subject ("You're registered for X", "X is starting tomorrow"). */
function lumaTitle(subject: string, snippet: string): string | undefined {
  const hosted = `${subject} ${snippet}`.match(
    /hosted by ([^,.!|\n]+?)(?:\s+(?:is|are|starts?|starting|on|at|in|this|tomorrow|today|tonight|—|-)\b|[,.!|]|$)/i,
  );
  if (hosted) return clean(hosted[1]);
  const s = clean(subject)
    .replace(/^(re|fwd?):\s*/i, "")
    .replace(
      /^(you('| a)re (registered|going|in|invited) (for|to)|registration (confirmed|approved) (for|:)|thanks for joining( us at)?( our)?|reminder:|invitation:|you're invited:|update:)\s*/i,
      "",
    )
    .replace(/\s+(is starting|starts) .*$/i, "")
    .replace(/^invite only\s*[-–—:]\s*/i, "")
    .replace(/[!.]+$/, "");
  return s.length >= 3 && s.length <= 90 ? s : undefined;
}

const known = (k: KnownCommunity, extra: Partial<Signal> = {}) => ({
  key: k.key,
  name: k.name,
  type: k.type,
  url: k.url,
  ...extra,
});

/**
 * Which communities one email is evidence for (usually zero or one). Pure: headers in,
 * signals out, so it is testable and cheap to re-run.
 */
export function classifyMessage(m: DetectMessage, ctx: Context): Signal[] {
  const from = m.from.email;
  const recipients = [...m.to, ...m.cc].map((a) => a.email);
  const fromMe = ctx.mine.has(from);
  const groupAddrs = recipients.filter((e) => e.endsWith("@groups.mobilize.io"));

  // Mail addressed to a colleague (same work domain, not you, not a list) isn't your community.
  if (!fromMe && recipients.length) {
    const toMe = recipients.some((e) => ctx.mine.has(e));
    const toColleague = recipients.some(
      (e) => !ctx.mine.has(e) && ctx.myDomains.has(domainOf(e)),
    );
    if (!toMe && toColleague && !groupAddrs.length) return [];
  }
  if (NEWSLETTER.test(from)) return [];

  const base = {
    occurredAt: m.occurredAt,
    subject: clean(m.subject).slice(0, 200),
  };
  const kind = fromMe ? "post" : kindOf(m.subject, m.snippet);

  // Mobilize: one address per group (bvpcfo@groups.mobilize.io); posts arrive via relays.
  const mobilizeGroups = [
    ...new Set([
      ...groupAddrs,
      ...(from.endsWith("@groups.mobilize.io") ? [from] : []),
    ]),
  ];
  if (mobilizeGroups.length || from.endsWith(".mobilize.io")) {
    if (!mobilizeGroups.length) return [];
    return mobilizeGroups.map((addr) => {
      const slug = addr.split("@")[0];
      const hit = knownByMobilize(slug);
      const tag = m.subject.match(/^\s*(?:re:\s*)?\[([^\]]{2,30})\]/i)?.[1];
      return {
        ...base,
        platform: "mobilize",
        kind: kind === "message" && fromMe ? "post" : kind,
        poster: fromMe ? undefined : m.from.name,
        ...(hit
          ? known(hit.community, { group: hit.group })
          : {
              // Headers don't name the community; the scanner reads one email's footer to fix this.
              key: `mobilize:${slug}`,
              name: `${titleCase(slug)} (Mobilize)`,
              group: tag,
              type: "other" as CommunityType,
            }),
      };
    });
  }
  if (fromMe) return [];

  const knownAddr = knownByAddress(from);

  // Luma: a community's calendar sends from slug@calendar.luma-mail.com.
  const lumaCal = from.match(/^([^@]+)@calendar\.luma-mail\.com$/)?.[1];
  if (lumaCal) {
    const k = knownByLuma(lumaCal) ?? knownByName(m.from.name ?? "");
    return [
      {
        ...base,
        platform: "luma",
        kind,
        ...(k
          ? known(k)
          : {
              key: `luma:${lumaCal}`,
              name: clean(m.from.name) || titleCase(lumaCal),
              type: "other" as CommunityType,
              url: `https://lu.ma/${lumaCal}`,
            }),
      },
    ];
  }
  // Luma: individual hosts send from usr-…@user.luma-mail.com; name it by host or event.
  if (from.endsWith("@user.luma-mail.com")) {
    const title = lumaTitle(m.subject, m.snippet);
    const k =
      knownAddr ??
      knownByName(`${title ?? ""} ${m.subject} ${m.snippet}`) ??
      undefined;
    if (k) return [{ ...base, platform: "luma", kind, ...known(k) }];
    if (!title) return [];
    return [
      {
        ...base,
        platform: "luma",
        kind,
        key: `luma-host:${from.split("@")[0]}`,
        name: title,
        type: "other",
      },
    ];
  }

  // Slack: only workspace invitations name the workspace; skip Slack Connect / guest access.
  if (from.endsWith("@slack.com")) {
    const text = `${m.subject} ${m.snippet}`;
    if (/temporarily join|work together in a slack channel|slack connect|shared channel|as a guest/i.test(text))
      return [];
    const ws =
      text.match(/join the slack workspace ([^.,(]+?)(?:[.,(]|\s+(?:and|on|to)\s|$)/i)?.[1] ??
      text.match(/join ([^.,]+?) on slack/i)?.[1];
    if (!ws) return [];
    const name = clean(ws);
    const orgWords = [...ctx.myDomains].map((d) => d.split(".")[0]);
    if (orgWords.some((w) => name.toLowerCase().includes(w))) return [];
    const k = knownByName(name);
    return [
      {
        ...base,
        platform: "slack",
        kind: "invite",
        ...(k
          ? known(k)
          : { key: `slack:${name.toLowerCase()}`, name, type: "other" as CommunityType }),
      },
    ];
  }

  // Discourse forums: notifications@<forum>.discoursemail.com, subject "[Forum] …".
  const discourse = from.match(/@([^.]+)\.discoursemail\.com$/)?.[1];
  if (discourse) {
    const name =
      m.subject.match(/^\s*\[([^\]]{2,60})\]/)?.[1] ?? titleCase(discourse);
    const k = knownByName(name);
    return [
      {
        ...base,
        platform: "discourse",
        kind,
        ...(k
          ? known(k)
          : { key: `discourse:${discourse}`, name: clean(name), type: "other" as CommunityType }),
      },
    ];
  }

  // Known communities that email from their own domain (CMX, NEXT Canada, Webflow…).
  if (knownAddr)
    return [{ ...base, platform: "email", kind, ...known(knownAddr) }];

  // Platforms where the From name is the community (Circle, Meetup, Bevy, Mighty, …).
  const platform = [
    ["circle", /@[^.]+\.circle\.so$|@mail\.circle\.so$/],
    ["meetup", /@(email\.)?meetup\.com$/],
    ["bevy", /@([^.]+\.)?bevy\.com$/],
    ["mighty", /@([^.]+\.)?mightynetworks\.com$/],
    ["skool", /@([^.]+\.)?skool\.com$/],
    ["hivebrite", /@([^.]+\.)?hivebrite\.com$/],
    ["bettermode", /@([^.]+\.)?bettermode\.io$/],
  ].find(([, re]) => (re as RegExp).test(from))?.[0] as string | undefined;
  if (platform) {
    const name = clean(m.from.name)
      .replace(/\s+(via|from|on)\s+(circle|meetup|bevy|mighty networks|skool|hivebrite|bettermode)$/i, "");
    if (!name || /^(circle|meetup|bevy|mighty networks|skool|hivebrite|bettermode|no-?reply|notifications?)$/i.test(name))
      return [];
    const k = knownByName(name);
    return [
      {
        ...base,
        platform,
        kind,
        ...(k
          ? known(k)
          : { key: `${platform}:${name.toLowerCase()}`, name, type: "other" as CommunityType }),
      },
    ];
  }

  // Google Groups and other discussion lists (need several distinct posters to count).
  if (m.listId && /googlegroups\.com$/.test(m.listId.id)) {
    const k = knownByName(m.listId.name);
    return [
      {
        ...base,
        platform: "googlegroups",
        kind,
        poster: from,
        ...(k
          ? known(k)
          : { key: `list:${m.listId.id}`, name: clean(m.listId.name) || m.listId.id, type: "other" as CommunityType }),
      },
    ];
  }
  return [];
}

export type Candidate = {
  key: string;
  name: string;
  platform: string;
  type: CommunityType;
  url?: string;
  score: number;
  role: "host" | "speaker" | "active member" | "attendee" | "member" | "invited";
  evidence: {
    messages: number;
    posts: number;
    registrations: number;
    first: string;
    last: string;
    months: number;
    groups: string[];
    samples: string[];
    platforms: string[];
  };
};

const DAY = 864e5;

/** Group signals into communities and rank by how involved you are. */
export function rankCandidates(signals: Signal[], now = Date.now()): Candidate[] {
  const by = new Map<string, Signal[]>();
  for (const s of signals) by.set(s.key, [...(by.get(s.key) ?? []), s]);
  const out: Candidate[] = [];
  for (const [key, list] of by) {
    const posters = new Set(list.map((s) => s.poster).filter(Boolean));
    if (key.startsWith("list:") && posters.size < 3) continue;
    // Name: the most common one (event titles vary for individual Luma hosts).
    const names = new Map<string, number>();
    for (const s of list) names.set(s.name, (names.get(s.name) ?? 0) + 1);
    const name = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let score = 0;
    const count = (k: SignalKind) => list.filter((s) => s.kind === k).length;
    for (const s of list) {
      const age = Math.max(0, (now - Date.parse(s.occurredAt)) / DAY);
      score += WEIGHT[s.kind] * Math.pow(0.5, age / 365);
    }
    const months = new Set(list.map((s) => s.occurredAt.slice(0, 7))).size;
    score += 2 * Math.log1p(months);
    const sorted = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const last = sorted.at(-1)!.occurredAt;
    if (now - Date.parse(last) > 730 * DAY) score *= 0.5;
    const role: Candidate["role"] = count("host")
      ? "host"
      : count("speaker")
        ? "speaker"
        : count("post")
          ? "active member"
          : count("registered")
            ? "attendee"
            : list.every((s) => s.kind === "invite")
              ? "invited"
              : "member";
    out.push({
      key,
      name,
      platform: list[0].platform,
      type: list[0].type,
      url: list.find((s) => s.url)?.url,
      score: Math.round(score * 10) / 10,
      role,
      evidence: {
        messages: list.length,
        posts: count("post"),
        registrations: count("registered"),
        first: sorted[0].occurredAt,
        last,
        months,
        groups: [...new Set(list.map((s) => s.group).filter(Boolean) as string[])].sort(),
        samples: [...new Set(sorted.slice(-6).reverse().map((s) => s.subject).filter(Boolean))].slice(0, 3),
        platforms: [...new Set(list.map((s) => s.platform))],
      },
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- storage ----------

export function saveSignals(accountId: string, messageId: string, signals: Signal[]) {
  run(
    "INSERT OR IGNORE INTO community_scan (account_id, message_id) VALUES (?, ?)",
    accountId,
    messageId,
  );
  for (const s of signals)
    run(
      `INSERT OR REPLACE INTO community_signals (account_id, message_id, key, data) VALUES (?, ?, ?, ?)`,
      accountId,
      messageId,
      s.key,
      JSON.stringify(s),
    );
}

/** Re-rank from every stored signal and upsert candidates, keeping confirm/dismiss choices. */
export function refreshCandidates(): Candidate[] {
  const signals = all<{ data: string }>("SELECT data FROM community_signals").map(
    (r) => JSON.parse(r.data) as Signal,
  );
  const ranked = rankCandidates(signals);
  tx(() => {
    for (const c of ranked)
      run(
        `INSERT INTO community_candidates (key, name, platform, type, url, score, role, evidence, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'suggested', datetime('now'))
         ON CONFLICT(key) DO UPDATE SET name = excluded.name, platform = excluded.platform, type = excluded.type,
           url = excluded.url, score = excluded.score, role = excluded.role, evidence = excluded.evidence, updated_at = excluded.updated_at`,
        c.key,
        c.name,
        c.platform,
        c.type,
        c.url ?? null,
        c.score,
        c.role,
        JSON.stringify(c.evidence),
      );
  });
  setMeta("communities_detected_at", new Date().toISOString());
  return ranked;
}

export type StoredCandidate = Candidate & {
  status: "suggested" | "confirmed" | "dismissed";
  community_id: string | null;
};

export function listCandidates(limit = 10, includeDismissed = false): StoredCandidate[] {
  return all<any>(
    `SELECT * FROM community_candidates ${includeDismissed ? "" : "WHERE status != 'dismissed'"}
     ORDER BY (status = 'confirmed') DESC, score DESC LIMIT ?`,
    limit,
  ).map((r) => ({ ...r, evidence: JSON.parse(r.evidence) }));
}

/** Confirm a detected community: it becomes a community you're a member of (with your role). */
export function confirmCandidate(key: string, role?: string): StoredCandidate | undefined {
  const c = get<any>("SELECT * FROM community_candidates WHERE key = ?", key);
  if (!c) return undefined;
  const evidence = JSON.parse(c.evidence) as Candidate["evidence"];
  const myRole = role || c.role;
  tx(() => {
    const id = ensureCommunity(c.name, c.platform, c.url ?? undefined);
    const ids = [id, ...evidence.groups.map((g) => ensureCommunity(`${c.name} · ${g}`, c.platform))];
    for (const pid of myPersonIds())
      for (const cid of ids)
        run(
          "INSERT OR REPLACE INTO memberships (community_id, person_id, role, source) VALUES (?, ?, ?, 'detected')",
          cid,
          pid,
          myRole,
        );
    run(
      "UPDATE community_candidates SET status = 'confirmed', role = ?, community_id = ? WHERE key = ?",
      myRole,
      id,
      key,
    );
  });
  return listCandidates(1000, true).find((x) => x.key === key);
}

export function dismissCandidate(key: string) {
  const c = get<{ community_id: string | null }>(
    "SELECT community_id FROM community_candidates WHERE key = ?",
    key,
  );
  tx(() => {
    if (c?.community_id)
      for (const pid of myPersonIds())
        run(
          "DELETE FROM memberships WHERE person_id = ? AND source = 'detected' AND (community_id = ? OR community_id IN (SELECT id FROM communities WHERE name LIKE (SELECT name FROM communities WHERE id = ?) || ' · %'))",
          pid,
          c.community_id,
          c.community_id,
        );
    run("UPDATE community_candidates SET status = 'dismissed' WHERE key = ?", key);
  });
}

/**
 * Rename an unknown Mobilize group once its community is known (from an email footer):
 * signals move under one key per community, with the group as a sub-group.
 */
export function resolveMobilizeGroup(slug: string, community: string, group?: string) {
  const k = knownByName(community);
  const key = k?.key ?? `mobilize-community:${community.toLowerCase()}`;
  const rows = all<{ account_id: string; message_id: string; data: string }>(
    "SELECT account_id, message_id, data FROM community_signals WHERE key = ?",
    `mobilize:${slug}`,
  );
  tx(() => {
    for (const r of rows) {
      const s = JSON.parse(r.data) as Signal;
      const next: Signal = {
        ...s,
        key,
        name: k?.name ?? community,
        type: k?.type ?? s.type,
        group: group ?? s.group,
      };
      run(
        "DELETE FROM community_signals WHERE account_id = ? AND message_id = ? AND key = ?",
        r.account_id,
        r.message_id,
        `mobilize:${slug}`,
      );
      run(
        "INSERT OR REPLACE INTO community_signals (account_id, message_id, key, data) VALUES (?, ?, ?, ?)",
        r.account_id,
        r.message_id,
        key,
        JSON.stringify(next),
      );
    }
    run("DELETE FROM community_candidates WHERE key = ? AND status = 'suggested'", `mobilize:${slug}`);
  });
  return rows.length;
}
