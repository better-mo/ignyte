import fs from "node:fs";
import { run, tx } from "../db/index.ts";
import { hash } from "../identity/normalize.ts";
import { saveInteraction, upsertObservation } from "../identity/store.ts";
import { readCsv, toIso } from "./files.ts";

const communityId = (name: string) => `c:${hash(name.toLowerCase())}`;

function ensureCommunity(name: string, provider = "manual", url?: string) {
  const id = communityId(name);
  run(
    "INSERT INTO communities (id, name, provider, url) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET url = COALESCE(excluded.url, url)",
    id,
    name,
    provider,
    url ?? null,
  );
  return id;
}

/**
 * Community memberships from a CSV (Slack/Discord/Bettermode member exports, or hand-made).
 * Columns: community, name, email, linkedin, x, role, provider — only `community` plus one identifier required.
 * Your own row (role=me or your email) marks you as a member.
 */
export function importCommunityMembers(csvPath: string, log = console.log) {
  const rows = readCsv(fs.readFileSync(csvPath, "utf8"));
  let count = 0;
  tx(() => {
    for (const r of rows) {
      if (!r.community) continue;
      const cid = ensureCommunity(r.community, r.provider || "manual");
      const isMe = (r.role ?? "").toLowerCase() === "me";
      const personId = upsertObservation(
        "community",
        cid,
        r.email || r.linkedin || r.x || r.name,
        {
          name: r.name,
          emails: r.email ? [r.email] : [],
          linkedinUrl: r.linkedin,
          xHandle: r.x,
        },
        { isMe },
      );
      if (!personId) continue;
      run(
        "INSERT OR REPLACE INTO memberships (community_id, person_id, role, source) VALUES (?, ?, ?, 'import')",
        cid,
        personId,
        isMe ? "member" : r.role || "member",
      );
      count++;
    }
  });
  log(`  communities: ${count} memberships from ${csvPath}`);
}

/**
 * Community posts/events from a CSV so Claude can cite what people said and what's coming up.
 * Columns: community, type (post|event), author_email, author_name, date, title, body, url, location
 */
export function importCommunityActivity(csvPath: string, log = console.log) {
  const rows = readCsv(fs.readFileSync(csvPath, "utf8"));
  let count = 0;
  tx(() => {
    for (const r of rows) {
      if (!r.community) continue;
      const cid = ensureCommunity(r.community);
      const isEvent = (r.type ?? "").toLowerCase() === "event";
      if (r.author_email || r.author_name) {
        const pid = upsertObservation(
          "community",
          cid,
          r.author_email || r.author_name,
          {
            name: r.author_name,
            emails: r.author_email ? [r.author_email] : [],
          },
        );
        if (pid)
          run(
            "INSERT OR IGNORE INTO memberships (community_id, person_id, role, source) VALUES (?, ?, 'member', 'activity')",
            cid,
            pid,
          );
      }
      saveInteraction({
        id: `community:${hash(JSON.stringify(r))}`,
        source: "community",
        accountId: cid,
        kind: isEvent ? "event" : "community_post",
        occurredAt: toIso(r.date),
        direction: "none",
        subject: r.title,
        snippet: (r.body ?? "").slice(0, 1000),
        url: r.url,
        communityId: cid,
        meta: { location: r.location, community: r.community },
        participants: r.author_email
          ? [
              {
                handleKind: "email",
                handle: r.author_email,
                name: r.author_name,
                role: "from",
              },
            ]
          : [],
      });
      count++;
    }
  });
  log(`  communities: ${count} posts/events from ${csvPath}`);
}
