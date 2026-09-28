import { config } from "../../config.ts";
import { tx } from "../../db/index.ts";
import { hash, normalizeEmail } from "../../identity/normalize.ts";
import { saveInteraction } from "../../identity/store.ts";
import type { Interaction } from "../../model.ts";
import { gget, saveSyncState, type GoogleAccount } from "./auth.ts";

export type CalendarEvent = {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { email?: string; self?: boolean };
  attendees?: {
    email?: string;
    displayName?: string;
    self?: boolean;
    responseStatus?: string;
    resource?: boolean;
    organizer?: boolean;
  }[];
  recurringEventId?: string;
  eventType?: string;
};

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A meeting with at least one other human that I didn't decline. */
export function mapCalendarEvent(
  ev: CalendarEvent,
  account: { id: string },
): Interaction | null {
  if (
    ev.status === "cancelled" ||
    ev.eventType === "workingLocation" ||
    ev.eventType === "outOfOffice"
  )
    return null;
  const start = ev.start?.dateTime ?? ev.start?.date;
  if (!start) return null;
  const attendees = (ev.attendees ?? []).filter((a) => a.email && !a.resource);
  const self = attendees.find((a) => a.self);
  if (self?.responseStatus === "declined") return null;
  const others = attendees.filter((a) => !a.self);
  if (others.length === 0 || others.length > 40) return null;
  return {
    // Same meeting on several of your calendars → one interaction (instances share iCalUID, so add start).
    id: `calendar:${hash(ev.iCalUID ?? `${account.id}:${ev.id}`)}:${start}`,
    source: "calendar",
    accountId: account.id,
    kind: "meeting",
    occurredAt: new Date(start).toISOString(),
    direction: ev.organizer?.self ? "out" : "in",
    subject: ev.summary?.slice(0, 300),
    snippet: ev.description
      ? stripHtml(ev.description).slice(0, 500)
      : undefined,
    threadId: ev.recurringEventId
      ? `calendar:${account.id}:${ev.recurringEventId}`
      : undefined,
    url: ev.htmlLink,
    meta: {
      location: ev.location,
      end: ev.end?.dateTime ?? ev.end?.date,
      attendeeCount: attendees.length,
      recurring: !!ev.recurringEventId,
    },
    participants: others
      .filter((a) => normalizeEmail(a.email))
      .map((a) => ({
        handleKind: "email" as const,
        handle: a.email!,
        name: a.displayName,
        role: a.organizer ? ("organizer" as const) : ("attendee" as const),
      })),
  };
}

export async function syncCalendar(account: GoogleAccount, log = console.log) {
  const now = Date.now();
  const timeMin = new Date(
    now - config.google.calendarLookbackDays * 864e5,
  ).toISOString();
  const timeMax = new Date(
    now + config.google.calendarLookaheadDays * 864e5,
  ).toISOString();
  let pageToken: string | undefined;
  let count = 0;
  do {
    const page = await gget<{
      items?: CalendarEvent[];
      nextPageToken?: string;
    }>(
      account,
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        pageToken,
      },
    );
    tx(() => {
      for (const ev of page.items ?? []) {
        const it = mapCalendarEvent(ev, account);
        if (it) {
          saveInteraction(it);
          count++;
        }
      }
    });
    pageToken = page.nextPageToken;
  } while (pageToken);
  (account.sync_state as Record<string, unknown>).calendarSyncedAt =
    new Date().toISOString();
  saveSyncState(account);
  log(
    `  calendar ${account.email}: ${count} meetings (past ${config.google.calendarLookbackDays}d, next ${config.google.calendarLookaheadDays}d)`,
  );
}
