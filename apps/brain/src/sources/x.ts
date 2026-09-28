import { config } from "../config.ts";
import { run, tx } from "../db/index.ts";
import { saveInteraction, upsertObservation } from "../identity/store.ts";
import { readExport } from "./files.ts";

type YtdEntry = Record<string, any>;

/** `window.YTD.following.part0 = [...]` -> array */
export function parseYtd(text: string | undefined): YtdEntry[] {
  if (!text) return [];
  const json = text.slice(text.indexOf("=") + 1).trim();
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export type XUser = {
  id: string;
  username: string;
  name: string;
  description?: string;
  location?: string;
  url?: string;
};

/** Resolve numeric account ids to handles/names via the X API (needs X_BEARER_TOKEN; billed per call). */
async function hydrate(
  ids: string[],
  log: (s: string) => void,
): Promise<Map<string, XUser>> {
  const out = new Map<string, XUser>();
  if (!config.x.bearerToken || ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = new URL("https://api.x.com/2/users");
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set(
      "user.fields",
      "description,location,url,name,username",
    );
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.x.bearerToken}` },
    });
    if (!res.ok) {
      log(`  x: user lookup failed (${res.status}); continuing with ids only`);
      break;
    }
    const body = (await res.json()) as { data?: XUser[] };
    for (const u of body.data ?? []) out.set(u.id, u);
  }
  return out;
}

/**
 * Import an X/Twitter archive (Settings → Your account → Download an archive).
 * People are created for mutual follows and DM partners; one-way follows only attach
 * to people already known by handle.
 */
export async function importX(
  archivePath: string,
  log = console.log,
  known: XUser[] = [],
) {
  const files = readExport(archivePath);
  const account = parseYtd(files.get("account.js"))[0]?.account;
  const profile = parseYtd(files.get("profile.js"))[0]?.profile;
  const following = new Set(
    parseYtd(files.get("following.js")).map((e) =>
      String(e.following?.accountId),
    ),
  );
  const followers = new Set(
    parseYtd(files.get("follower.js")).map((e) =>
      String(e.follower?.accountId),
    ),
  );
  const dms = [
    ...parseYtd(files.get("direct-messages.js")),
    ...parseYtd(files.get("direct-messages-group.js")),
  ];
  if (!account)
    throw new Error(
      `No account.js found in ${archivePath} (is this an X archive?)`,
    );
  const myId = String(account.accountId);

  const dmPartners = new Map<string, number>();
  for (const conv of dms) {
    for (const m of conv.dmConversation?.messages ?? []) {
      const mc = m.messageCreate;
      if (!mc) continue;
      for (const id of [mc.senderId, mc.recipientId]
        .filter(Boolean)
        .map(String)) {
        if (id !== myId) dmPartners.set(id, (dmPartners.get(id) ?? 0) + 1);
      }
    }
  }
  const mutuals = [...following].filter((id) => followers.has(id));
  const promoted = new Set([...mutuals, ...dmPartners.keys()]);
  const oneWay = [...following].filter((id) => !promoted.has(id));
  const users = new Map(known.map((u) => [u.id, u]));
  for (const [id, u] of await hydrate(
    [...promoted, ...oneWay].filter((id) => !users.has(id)),
    log,
  ))
    users.set(id, u);

  tx(() => {
    upsertObservation(
      "me",
      "x",
      "self",
      {
        name: account.accountDisplayName,
        xHandle: account.username,
        xId: myId,
        emails: account.email ? [account.email] : [],
        bio: profile?.description?.bio,
      },
      { isMe: true },
    );

    const observe = (id: string, create: boolean) => {
      const u = users.get(id);
      return upsertObservation(
        "x",
        "x",
        id,
        {
          xId: id,
          xHandle: u?.username,
          name: u?.name,
          bio: u?.description,
          location: u?.location,
          urls: u?.url ? [u.url] : [],
        },
        { create },
      );
    };

    for (const id of promoted) {
      observe(id, true);
      const both = following.has(id) && followers.has(id);
      if (following.has(id) || followers.has(id)) {
        saveInteraction({
          id: `x:follow:${id}`,
          source: "x",
          accountId: "x",
          kind: "follow",
          occurredAt: new Date().toISOString(),
          direction: both ? "mutual" : following.has(id) ? "out" : "in",
          subject: both
            ? "Follow each other on X"
            : following.has(id)
              ? "You follow them on X"
              : "Follows you on X",
          meta: { static: true },
          participants: [
            {
              handleKind: "x_id",
              handle: id,
              name: users.get(id)?.name,
              role: "member",
            },
          ],
        });
      }
    }
    for (const id of oneWay) observe(id, false);

    for (const conv of dms) {
      const convId = conv.dmConversation?.conversationId;
      for (const m of conv.dmConversation?.messages ?? []) {
        const mc = m.messageCreate;
        if (!mc?.id) continue;
        const sender = String(mc.senderId);
        const recipients = mc.recipientId
          ? [String(mc.recipientId)]
          : (conv.dmConversation?.participants ?? [])
              .map(String)
              .filter((p: string) => p !== sender);
        saveInteraction({
          id: `x:dm:${mc.id}`,
          source: "x",
          accountId: "x",
          kind: "dm",
          occurredAt: new Date(mc.createdAt).toISOString(),
          direction: sender === myId ? "out" : "in",
          snippet: String(mc.text ?? "").slice(0, 500),
          threadId: `x:${convId}`,
          participants: [
            { handleKind: "x_id", handle: sender, role: "sender" },
            ...recipients.map((r: string) => ({
              handleKind: "x_id" as const,
              handle: r,
              role: "recipient" as const,
            })),
          ],
        });
      }
    }
  });

  run(
    `INSERT INTO accounts (id, provider, label, email, sync_state) VALUES ('x', 'x', ?, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, sync_state = excluded.sync_state`,
    `@${account.username}`,
    JSON.stringify({
      importedAt: new Date().toISOString(),
      path: archivePath,
      hydrated: users.size,
    }),
  );
  log(
    `  x: ${following.size} following, ${followers.size} followers, ${mutuals.length} mutual, ${dmPartners.size} DM partners` +
      (config.x.bearerToken
        ? `, ${users.size} handles resolved`
        : " (set X_BEARER_TOKEN to resolve handles)"),
  );
}
