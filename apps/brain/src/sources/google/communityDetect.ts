import { all, tx } from "../../db/index.ts";
import { detectionQuery } from "../../communities/catalog.ts";
import {
  classifyMessage,
  contextFromDb,
  refreshCandidates,
  resolveMobilizeGroup,
  saveSignals,
} from "../../communities/detect.ts";
import { messageText, parseMobilize, type FullMessage } from "./communityDigests.ts";
import { gget, pool, saveSyncState, type GoogleAccount } from "./auth.ts";
import { parseAddressList, parseListId, type GmailMessage } from "./gmail.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const HEADERS = ["From", "To", "Cc", "Subject", "List-Id", "Date"];

/**
 * Find the communities you belong to: search every Gmail category (promotions and social
 * included, where community mail usually lands) for mail from community platforms and
 * catalogued communities, headers + snippet only, and rank what it's evidence for.
 */
export async function detectCommunities(
  account: GoogleAccount,
  log = console.log,
  lookbackDays = 1095,
  maxMessages = 6000,
) {
  const state = account.sync_state as { detectAfter?: number };
  const q = [
    detectionQuery(),
    state.detectAfter ? `after:${state.detectAfter}` : `newer_than:${lookbackDays}d`,
    "-in:spam -in:trash",
  ].join(" ");
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gget<{ messages?: { id: string }[]; nextPageToken?: string }>(
      account,
      `${API}/messages`,
      { q, maxResults: "500", pageToken },
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < maxMessages);

  const seen = new Set(
    all<{ message_id: string }>(
      "SELECT message_id FROM community_scan WHERE account_id = ?",
      account.id,
    ).map((r) => r.message_id),
  );
  const todo = ids.slice(0, maxMessages).filter((id) => !seen.has(id));
  log(`  communities ${account.email}: ${ids.length} community emails, ${todo.length} new to read`);

  const ctx = contextFromDb();
  let newest = state.detectAfter ?? 0;
  let hits = 0;
  let done = 0;
  const batch: [string, ReturnType<typeof classifyMessage>][] = [];
  const flush = () =>
    tx(() => {
      for (const [id, signals] of batch.splice(0)) saveSignals(account.id, id, signals);
    });
  try {
    await pool(todo, 8, async (id) => {
      const msg = await gget<GmailMessage>(account, `${API}/messages/${id}`, {
        format: "metadata",
        metadataHeaders: HEADERS,
      });
      const h = new Map((msg.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
      const from = parseAddressList(h.get("from"))[0];
      newest = Math.max(newest, Math.floor(Number(msg.internalDate) / 1000));
      const signals = from
        ? classifyMessage(
            {
              id,
              from,
              to: parseAddressList(h.get("to")),
              cc: parseAddressList(h.get("cc")),
              subject: h.get("subject") ?? "",
              snippet: msg.snippet ?? "",
              listId: parseListId(h.get("list-id")),
              occurredAt: new Date(Number(msg.internalDate)).toISOString(),
            },
            ctx,
          )
        : [];
      hits += signals.length ? 1 : 0;
      batch.push([id, signals]);
      if (++done % 200 === 0) {
        flush();
        log(`  communities ${account.email}: ${done}/${todo.length}`);
      }
    });
  } finally {
    flush();
  }
  state.detectAfter = newest;
  saveSyncState(account);

  // Unknown Mobilize groups: read one email in full to learn the community's name.
  const unknown = all<{ key: string; message_id: string }>(
    `SELECT key, MIN(message_id) AS message_id FROM community_signals
     WHERE account_id = ? AND key LIKE 'mobilize:%' GROUP BY key`,
    account.id,
  );
  for (const u of unknown) {
    const full = await gget<FullMessage>(account, `${API}/messages/${u.message_id}`, {
      format: "full",
    }).catch(() => null);
    if (!full) continue;
    const h = new Map((full.payload.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
    const parsed = parseMobilize({
      text: messageText(full.payload),
      subject: h.get("subject") ?? "",
      fromName: parseAddressList(h.get("from"))[0]?.name,
      cc: parseAddressList(h.get("cc")).map((a) => a.email),
    });
    if (parsed?.community) resolveMobilizeGroup(u.key.slice(9), parsed.community, parsed.group);
  }

  const ranked = refreshCandidates();
  log(`  communities ${account.email}: ${hits} emails matched, ${ranked.length} communities found`);
  return ranked;
}
