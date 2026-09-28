import { run, tx } from "../db/index.ts";
import { hash, linkedinSlug } from "../identity/normalize.ts";
import { saveInteraction, upsertObservation } from "../identity/store.ts";
import type { Participant } from "../model.ts";
import { looseDate, readCsv, readExport, toIso } from "./files.ts";

/**
 * Import a LinkedIn data export (Settings → Data privacy → Get a copy of your data).
 * Accepts the downloaded .zip or the unzipped folder.
 */
export function importLinkedIn(exportPath: string, log = console.log) {
  const files = readExport(exportPath);
  const connections = readCsv(files.get("connections.csv"), "First Name");
  const messages = readCsv(files.get("messages.csv"), "CONVERSATION ID");
  const profile = readCsv(files.get("profile.csv"))[0];
  const positions = readCsv(files.get("positions.csv"));
  const education = readCsv(files.get("education.csv"));
  const myEmails = readCsv(files.get("email addresses.csv"))
    .map((r) => r["Email Address"])
    .filter(Boolean);
  const invitations = readCsv(files.get("invitations.csv"));
  const endorsements = readCsv(files.get("endorsement_received_info.csv"));

  if (!connections.length && !messages.length) {
    throw new Error(
      `No Connections.csv or messages.csv found in ${exportPath}`,
    );
  }

  // Work out my own profile URL: the most common sender in the SENT folder.
  const sentCounts = new Map<string, number>();
  for (const m of messages) {
    if (
      (m["FOLDER"] ?? "").toUpperCase() === "SENT" &&
      m["SENDER PROFILE URL"]
    ) {
      sentCounts.set(
        m["SENDER PROFILE URL"],
        (sentCounts.get(m["SENDER PROFILE URL"]) ?? 0) + 1,
      );
    }
  }
  const myUrl = [...sentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const mySlug = linkedinSlug(myUrl);

  tx(() => {
    if (profile || myUrl) {
      upsertObservation(
        "me",
        "linkedin",
        "self",
        {
          name: profile
            ? `${profile["First Name"]} ${profile["Last Name"]}`.trim()
            : undefined,
          headline: profile?.["Headline"],
          bio: profile?.["Summary"],
          location: profile?.["Geo Location"],
          linkedinUrl: myUrl,
          emails: myEmails,
          xHandle: profile?.["Twitter Handles"]
            ?.split(/[,\s]/)[0]
            ?.replace(/[\[\]]/g, ""),
          positions: positions.map((p) => ({
            company: p["Company Name"],
            title: p["Title"],
            start: looseDate(p["Started On"]),
            end: looseDate(p["Finished On"]),
            current: !p["Finished On"],
          })),
          schools: education.map((e) => ({
            school: e["School Name"],
            degree: e["Degree Name"],
            start: looseDate(e["Start Date"]),
            end: looseDate(e["End Date"]),
          })),
        },
        { isMe: true },
      );
    }

    for (const c of connections) {
      const slug = linkedinSlug(c["URL"]);
      const name = `${c["First Name"] ?? ""} ${c["Last Name"] ?? ""}`.trim();
      if (!slug && !name) continue;
      const personId = upsertObservation(
        "linkedin",
        "linkedin",
        slug ?? hash(name),
        {
          name,
          firstName: c["First Name"],
          lastName: c["Last Name"],
          linkedinUrl: c["URL"],
          emails: c["Email Address"] ? [c["Email Address"]] : [],
          company: c["Company"],
          title: c["Position"],
          positions: c["Company"]
            ? [{ company: c["Company"], title: c["Position"], current: true }]
            : [],
          connectedOn: looseDate(c["Connected On"]),
        },
      );
      if (personId && slug && c["Connected On"]) {
        saveInteraction({
          id: `linkedin:connected:${slug}`,
          source: "linkedin",
          accountId: "linkedin",
          kind: "connected",
          occurredAt: toIso(c["Connected On"]),
          direction: "mutual",
          subject: "Connected on LinkedIn",
          participants: [
            { handleKind: "linkedin", handle: slug, name, role: "member" },
          ],
        });
      }
    }

    // Senders/recipients we only know from messages (not connections) still become people.
    for (const m of messages) {
      const senderSlug = linkedinSlug(m["SENDER PROFILE URL"]);
      const recipientUrls = (m["RECIPIENT PROFILE URLS"] ?? "")
        .split(/[,\s]+/)
        .filter(Boolean);
      const recipientNames = (m["TO"] ?? "").split(/,\s*/);
      const participants: Participant[] = [];
      if (senderSlug) {
        participants.push({
          handleKind: "linkedin",
          handle: senderSlug,
          name: m["FROM"],
          role: "sender",
        });
        if (senderSlug !== mySlug)
          upsertObservation("linkedin", "linkedin", senderSlug, {
            name: m["FROM"],
            linkedinUrl: m["SENDER PROFILE URL"],
          });
      }
      recipientUrls.forEach((url, i) => {
        const slug = linkedinSlug(url);
        if (!slug) return;
        participants.push({
          handleKind: "linkedin",
          handle: slug,
          name: recipientNames[i],
          role: "recipient",
        });
        if (slug !== mySlug)
          upsertObservation("linkedin", "linkedin", slug, {
            name: recipientNames[i],
            linkedinUrl: url,
          });
      });
      if (participants.length < 2) continue;
      saveInteraction({
        id: `linkedin:msg:${hash(`${m["CONVERSATION ID"]}|${m["DATE"]}|${m["FROM"]}|${(m["CONTENT"] ?? "").slice(0, 40)}`)}`,
        source: "linkedin",
        accountId: "linkedin",
        kind: "linkedin_message",
        occurredAt: toIso(m["DATE"]),
        direction: senderSlug && senderSlug === mySlug ? "out" : "in",
        subject: m["SUBJECT"] || m["CONVERSATION TITLE"] || undefined,
        snippet: (m["CONTENT"] ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 500),
        threadId: `linkedin:${m["CONVERSATION ID"]}`,
        participants,
      });
    }

    for (const e of endorsements) {
      const slug = linkedinSlug(e["Endorser Public Url"]);
      if (!slug) continue;
      saveInteraction({
        id: `linkedin:endorse:${hash(`${slug}|${e["Skill Name"]}`)}`,
        source: "linkedin",
        accountId: "linkedin",
        kind: "connected",
        occurredAt: toIso(e["Endorsement Date"]),
        direction: "in",
        subject: `Endorsed you for ${e["Skill Name"]}`,
        participants: [
          {
            handleKind: "linkedin",
            handle: slug,
            name: `${e["Endorser First Name"]} ${e["Endorser Last Name"]}`,
            role: "sender",
          },
        ],
      });
    }
  });

  run(
    `INSERT INTO accounts (id, provider, label, email, sync_state) VALUES ('linkedin', 'linkedin', 'LinkedIn export', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET sync_state = excluded.sync_state`,
    JSON.stringify({ importedAt: new Date().toISOString(), path: exportPath }),
  );
  log(
    `  linkedin: ${connections.length} connections, ${messages.length} messages, ${invitations.length} invitations, ${endorsements.length} endorsements` +
      (mySlug ? ` (you: ${mySlug})` : ""),
  );
}
