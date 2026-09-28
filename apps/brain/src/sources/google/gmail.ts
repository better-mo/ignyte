import { config } from "../../config.ts";
import { run, tx } from "../../db/index.ts";
import {
  hash,
  looksAutomated,
  normalizeEmail,
} from "../../identity/normalize.ts";
import {
  myEmails,
  saveInteraction,
  upsertObservation,
} from "../../identity/store.ts";
import type { Interaction, Participant } from "../../model.ts";
import { gget, pool, saveSyncState, type GoogleAccount } from "./auth.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const HEADERS = [
  "Message-ID",
  "From",
  "To",
  "Cc",
  "Date",
  "Subject",
  "List-Id",
  "List-Unsubscribe",
  "Precedence",
  "Auto-Submitted",
];

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: { headers?: { name: string; value: string }[] };
};

/** Parse `"Chen, Sara" <sara@x.com>, bob@y.com` into address/name pairs. */
export function parseAddressList(
  value?: string,
): { email: string; name?: string }[] {
  if (!value) return [];
  const out: { email: string; name?: string }[] = [];
  let buf = "";
  let quoted = false;
  let angle = 0;
  const flush = () => {
    const part = buf.trim();
    buf = "";
    if (!part) return;
    const m = part.match(/^(.*?)<([^>]+)>\s*$/);
    const rawEmail = (m ? m[2] : part).trim();
    const email = normalizeEmail(rawEmail);
    if (!email) return;
    let name = m?.[1].trim().replace(/^"|"$/g, "").replace(/\\"/g, '"').trim();
    if (name && (name.includes("@") || name === rawEmail)) name = undefined;
    if (name && /^[^,]+,\s*[^,]+$/.test(name)) {
      const [last, first] = name.split(/,\s*/);
      name = `${first} ${last}`;
    }
    out.push({ email, name: name || undefined });
  };
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<") angle++;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) flush();
    else buf += ch;
  }
  flush();
  return out;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export function parseListId(
  value?: string,
): { id: string; name: string } | null {
  if (!value) return null;
  const m = value.match(/^(.*?)<([^>]+)>/);
  const id = (m ? m[2] : value).trim().toLowerCase();
  const name = (m?.[1].trim().replace(/^"|"$/g, "") || id.split(".")[0]).trim();
  return id ? { id, name } : null;
}

/** Pure mapping from a Gmail metadata message to an interaction (tested). */
export function mapGmailMessage(
  msg: GmailMessage,
  account: { id: string; email: string },
  mine: Set<string>,
): Interaction | null {
  const h = new Map(
    (msg.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]),
  );
  const from = parseAddressList(h.get("from"))[0];
  if (!from) return null;
  const to = parseAddressList(h.get("to"));
  const cc = parseAddressList(h.get("cc"));
  const list = parseListId(h.get("list-id"));
  const fromMe = mine.has(from.email) || (msg.labelIds ?? []).includes("SENT");
  const bulk =
    !fromMe &&
    (!!h.get("list-unsubscribe") ||
      /bulk|list|junk/i.test(h.get("precedence") ?? "") ||
      /auto-/i.test(h.get("auto-submitted") ?? "") ||
      looksAutomated(from.email));

  const participants: Participant[] = [
    { handleKind: "email", handle: from.email, name: from.name, role: "from" },
    ...to.map((a) => ({
      handleKind: "email" as const,
      handle: a.email,
      name: a.name,
      role: "to" as const,
    })),
    ...cc.map((a) => ({
      handleKind: "email" as const,
      handle: a.email,
      name: a.name,
      role: "cc" as const,
    })),
  ];
  const communityId = list && !fromMe ? `list:${list.id}` : undefined;
  return {
    // Message-ID dedupes one email that landed in several of your inboxes.
    id: h.get("message-id")
      ? `gmail:${hash(h.get("message-id")!)}`
      : `gmail:${account.id}:${msg.id}`,
    source: "gmail",
    accountId: account.id,
    kind: communityId ? "community_post" : "email",
    occurredAt: new Date(Number(msg.internalDate)).toISOString(),
    direction: fromMe ? "out" : "in",
    subject: h.get("subject")?.slice(0, 300),
    snippet: msg.snippet
      ? decodeEntities(msg.snippet).slice(0, 500)
      : undefined,
    threadId: `gmail:${account.id}:${msg.threadId}`,
    url: `https://mail.google.com/mail/u/${account.email}/#all/${msg.id}`,
    isBulk: bulk && !communityId,
    communityId,
    meta: list ? { listId: list.id, listName: list.name } : {},
    participants,
  };
}

async function registerSelf(account: GoogleAccount): Promise<Set<string>> {
  const aliases = await gget<{
    sendAs?: { sendAsEmail: string; displayName?: string }[];
  }>(account, `${API}/settings/sendAs`).catch(() => ({ sendAs: [] }));
  const emails = [
    account.email,
    ...(aliases.sendAs ?? []).map((a) => a.sendAsEmail),
  ];
  const name = aliases.sendAs?.find((a) => a.displayName)?.displayName;
  upsertObservation("me", account.id, "self", { name, emails }, { isMe: true });
  return new Set(emails.map((e) => normalizeEmail(e)!).filter(Boolean));
}

export async function syncGmail(
  account: GoogleAccount,
  log = console.log,
  maxMessages = Infinity,
) {
  // All of your addresses across accounts, so mail between your own inboxes reads correctly.
  const mine = new Set([...(await registerSelf(account)), ...myEmails()]);
  const state = account.sync_state as { gmailAfter?: number };
  const q = [
    state.gmailAfter
      ? `after:${state.gmailAfter}`
      : `newer_than:${config.google.gmailLookbackDays}d`,
    "-in:chats -in:spam -in:trash -category:promotions -category:social",
  ].join(" ");

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gget<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(account, `${API}/messages`, {
      q,
      maxResults: "500",
      pageToken,
    });
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
    log(`  gmail ${account.email}: listed ${ids.length} messages`);
  } while (pageToken && ids.length < maxMessages);

  let done = 0;
  let newest = state.gmailAfter ?? 0;
  const communities = new Map<string, string>();
  const batch: Interaction[] = [];
  const flush = () =>
    tx(() => {
      for (const it of batch.splice(0)) saveInteraction(it);
    });

  await pool(ids.slice(0, maxMessages), 10, async (id) => {
    const msg = await gget<GmailMessage>(account, `${API}/messages/${id}`, {
      format: "metadata",
      metadataHeaders: HEADERS,
    });
    const it = mapGmailMessage(msg, account, mine);
    if (it) {
      batch.push(it);
      if (it.communityId)
        communities.set(
          it.communityId,
          String(it.meta?.listName ?? it.communityId),
        );
    }
    newest = Math.max(newest, Math.floor(Number(msg.internalDate) / 1000));
    if (++done % 200 === 0) {
      flush();
      log(`  gmail ${account.email}: ${done}/${ids.length}`);
    }
  });
  flush();

  for (const [id, name] of communities) {
    run(
      "INSERT INTO communities (id, name, provider, external_id) VALUES (?, ?, 'email_list', ?) ON CONFLICT(id) DO NOTHING",
      id,
      name,
      id.slice(5),
    );
  }
  state.gmailAfter = newest;
  saveSyncState(account);
  log(
    `  gmail ${account.email}: synced ${done} messages, ${communities.size} mailing-list communities`,
  );
}
