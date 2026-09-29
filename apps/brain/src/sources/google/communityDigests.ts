import { config } from "../../config.ts";
import { tx } from "../../db/index.ts";
import { hash } from "../../identity/normalize.ts";
import {
  myPersonIds,
  saveInteraction,
  upsertObservation,
} from "../../identity/store.ts";
import { run } from "../../db/index.ts";
import { ensureCommunity } from "../communities.ts";
import { gget, pool, saveSyncState, type GoogleAccount } from "./auth.ts";
import { parseAddressList } from "./gmail.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Community platforms whose notification emails we read in full (bodies only for
 * these senders; everything else stays headers + snippet). Mobilize is parsed by rule.
 */
export const COMMUNITY_SENDERS = "from:members.mobilize.io";

export type DigestPost = {
  author: string;
  company?: string;
  text: string;
  original: boolean;
};

export type ParsedDigest = {
  community: string;
  group?: string;
  title: string;
  url?: string;
  posts: DigestPost[];
};

const NAME =
  /^(?=.{3,45}$)[A-ZÀ-Ý][\p{L}'’.-]*(?: (?:[a-z]{1,3} )?[A-ZÀ-Ý][\p{L}'’.-]*){1,3}$/u;
const COMPANY = /^(?=.{2,60}$)[\p{Lu}\p{N}@][^\n]*[^.,:;]$/u;
const NOISE =
  /^(\[Join this discussion\]|\[Unfollow this post\]|Reply to chat privately with|Reply all to discuss|appreciates: \d|comments: \d|To customize which emails)/;

/** "[HR] Re: US : Background Verifications" -> { tag: "HR", title: "US : Background Verifications" } */
function splitSubject(subject: string) {
  const m = subject.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
  const rest = (m ? m[2] : subject).replace(/^(re|fwd?):\s*/i, "").trim();
  return { tag: m?.[1].trim(), title: rest };
}

/**
 * Split a block of Mobilize text into posts. Each post ends with a signature of two
 * lines — the author's name and their company — right after a sentence ends.
 */
function splitPosts(block: string, original: boolean): DigestPost[] {
  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !NOISE.test(l));
  const posts: DigestPost[] = [];
  let buf: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i];
    const company = lines[i + 1] ?? "";
    const prev = buf.filter(Boolean).at(-1) ?? "";
    const endsSentence =
      !prev || /[.!?)"'’”:\p{Extended_Pictographic}]$/u.test(prev);
    const atBoundary = !lines[i + 2]; // blank line or end after the signature
    if (
      NAME.test(name) &&
      COMPANY.test(company) &&
      !NAME.test(prev) &&
      endsSentence &&
      atBoundary
    ) {
      const text = buf
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text || original)
        posts.push({ author: name, company, text, original });
      buf = [];
      i += 1;
      continue;
    }
    buf.push(name);
  }
  return posts;
}

/** Pure parser for a Mobilize notification email (tested). */
export function parseMobilize(input: {
  text: string;
  subject: string;
  fromName?: string;
  cc?: string[];
}): ParsedDigest | null {
  const footer = input.text.match(
    /because you are a member of ([^\n]+?)\.?\s*(?:\n|$)/,
  );
  const community =
    footer?.[1].trim() ?? input.fromName?.match(/\(([^)]+)\)\s*$/)?.[1].trim();
  if (!community) return null;
  const body = input.text.split(/You[’']re receiving this message/)[0];
  const { tag, title: subjectTitle } = splitSubject(input.subject);
  const groupFromCc = input.cc
    ?.map((c) => c.match(/^([^@]+)@groups\.mobilize\.io$/i)?.[1])
    .find(Boolean);
  const url = body.match(/desktop_url=([^&)\s]+)/)?.[1];

  // Replies quote the original between dashed rules: comments above, original below.
  const rule = body.match(/\n-{5,}\n([^\n]+)\n-{5,}\n/);
  let posts: DigestPost[];
  let title = subjectTitle;
  if (rule) {
    title = rule[1].trim();
    const [comments, original] = [
      body.slice(0, rule.index),
      body.slice(rule.index! + rule[0].length),
    ];
    posts = [...splitPosts(comments, false), ...splitPosts(original, true)];
  } else {
    posts = splitPosts(body, true);
  }
  if (!posts.length && input.fromName) {
    const author = input.fromName.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (NAME.test(author))
      posts = [{ author, text: body.trim().slice(0, 2000), original: true }];
  }
  return {
    community,
    group: tag ?? groupFromCc ?? undefined,
    title,
    url: url ? decodeURIComponent(url) : undefined,
    posts,
  };
}

export type FullMessage = {
  id: string;
  internalDate: string;
  payload: {
    mimeType: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: FullMessage["payload"][];
  };
};

/** Prefer the text/plain part; fall back to stripped HTML. */
export function messageText(payload: FullMessage["payload"]): string {
  const find = (
    p: FullMessage["payload"],
    type: string,
  ): string | undefined => {
    if (p.mimeType === type && p.body?.data)
      return Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const part of p.parts ?? []) {
      const hit = find(part, type);
      if (hit) return hit;
    }
    return undefined;
  };
  const plain = find(payload, "text/plain");
  if (plain) return plain;
  const html = find(payload, "text/html") ?? "";
  return html
    .replace(/<br\s*\/?>|<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "’");
}

/** Store one parsed digest: community + group, authors as members, posts as activity. */
export function saveDigest(
  d: ParsedDigest,
  occurredAt: string,
  provider = "mobilize",
) {
  const main = ensureCommunity(d.community, provider);
  const group = d.group
    ? ensureCommunity(`${d.community} · ${d.group}`, provider)
    : null;
  const communityIds = [main, ...(group ? [group] : [])];
  for (const me of myPersonIds()) {
    for (const cid of communityIds)
      run(
        "INSERT OR IGNORE INTO memberships (community_id, person_id, role, source) VALUES (?, ?, 'member', ?)",
        cid,
        me,
        provider,
      );
  }
  let saved = 0;
  for (const post of d.posts) {
    // No usable email (relay addresses), so identity is name + company within this community;
    // same-name matching later links them to people you already know.
    const personId = upsertObservation(
      "community",
      main,
      `${post.author.toLowerCase()}|${(post.company ?? "").toLowerCase()}`,
      {
        name: post.author,
        company: post.company,
        positions: post.company
          ? [{ company: post.company, current: true }]
          : [],
      },
    );
    if (!personId) continue;
    for (const cid of communityIds)
      run(
        "INSERT OR IGNORE INTO memberships (community_id, person_id, role, source) VALUES (?, ?, 'member', ?)",
        cid,
        personId,
        provider,
      );
    if (!post.text) continue;
    saveInteraction({
      // Content hash: the same comment is re-quoted in every later reply email.
      id: `${provider}:${hash(`${main}|${post.author}|${post.text.slice(0, 300)}`)}`,
      source: "community",
      accountId: main,
      kind: "community_post",
      occurredAt,
      direction: "none",
      subject: post.original ? d.title : `Re: ${d.title}`,
      snippet: post.text.slice(0, 1500),
      url: d.url,
      communityId: group ?? main,
      meta: {
        community: d.community,
        group: d.group,
        company: post.company,
        original: post.original,
      },
      participants: [
        {
          handleKind: "person",
          handle: personId,
          name: post.author,
          role: "from",
        },
      ],
    });
    saved++;
  }
  return saved;
}

/** Read community notification emails in full and turn them into members and posts. */
export async function syncCommunityDigests(
  account: GoogleAccount,
  log = console.log,
) {
  const state = account.sync_state as { communitiesAfter?: number };
  const q = [
    COMMUNITY_SENDERS,
    state.communitiesAfter
      ? `after:${state.communitiesAfter}`
      : `newer_than:${config.google.gmailLookbackDays}d`,
  ].join(" ");
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gget<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(account, `${API}/messages`, { q, maxResults: "500", pageToken });
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (!ids.length) {
    log(`  communities ${account.email}: no new community emails`);
    return;
  }

  let posts = 0;
  let newest = state.communitiesAfter ?? 0;
  const communities = new Set<string>();
  await pool(ids, 6, async (id) => {
    const msg = await gget<FullMessage>(account, `${API}/messages/${id}`, {
      format: "full",
    });
    const h = new Map(
      (msg.payload.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]),
    );
    const parsed = parseMobilize({
      text: messageText(msg.payload),
      subject: h.get("subject") ?? "",
      fromName: parseAddressList(h.get("from"))[0]?.name ?? h.get("from"),
      cc: parseAddressList(h.get("cc")).map((a) => a.email),
    });
    newest = Math.max(newest, Math.floor(Number(msg.internalDate) / 1000));
    if (!parsed) return;
    communities.add(
      parsed.group ? `${parsed.community} · ${parsed.group}` : parsed.community,
    );
    posts += tx(() =>
      saveDigest(parsed, new Date(Number(msg.internalDate)).toISOString()),
    );
  });
  state.communitiesAfter = newest;
  saveSyncState(account);
  log(
    `  communities ${account.email}: ${ids.length} emails → ${posts} posts in ${communities.size} communities/groups`,
  );
}
