import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.IGNYTE_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "brain-unit-"),
);
const {
  normalizeEmail,
  normalizePhone,
  linkedinSlug,
  xHandle,
  companyKey,
  looksAutomated,
} = await import("../src/identity/normalize.ts");
const { parseAddressList, mapGmailMessage, parseListId } =
  await import("../src/sources/google/gmail.ts");
const { mapCalendarEvent } = await import("../src/sources/google/calendar.ts");
const { parseVcf } = await import("../src/sources/vcard.ts");
const { readCsv, looseDate } = await import("../src/sources/files.ts");
const { parseYtd } = await import("../src/sources/x.ts");
const { mapPdl } = await import("../src/enrich/providers.ts");
const { ftsQuery } = await import("../src/index/search.ts");
const { canonicalKey, normalizeDomain } =
  await import("../src/companies/index.ts");

test("email normalization folds gmail dots and plus tags", () => {
  assert.equal(
    normalizeEmail("Sara.Chen+news@GoogleMail.com"),
    "sarachen@gmail.com",
  );
  assert.equal(normalizeEmail("sara.chen@figma.com"), "sara.chen@figma.com");
  assert.equal(normalizeEmail("not an email"), null);
});

test("phones normalize to E.164", () => {
  assert.equal(normalizePhone("(416) 555-0199"), "+14165550199");
  assert.equal(normalizePhone("+34 612 345 678"), "+34612345678");
});

test("linkedin and x handles", () => {
  assert.equal(
    linkedinSlug("https://www.linkedin.com/in/Sara-Chen-123/?trk=x"),
    "sara-chen-123",
  );
  assert.equal(xHandle("https://x.com/Sara_C"), "sara_c");
  assert.equal(xHandle("@Sara_C"), "sara_c");
  assert.equal(xHandle("https://twitter.com/intent/user?user_id=1"), null);
});

test("company keys ignore suffixes", () => {
  assert.equal(companyKey("Shopify Inc."), "shopify");
  assert.equal(companyKey("Stripe, LLC"), "stripe");
});

test("automated senders are detected but employers are not", () => {
  assert.ok(looksAutomated("noreply@github.com"));
  assert.ok(looksAutomated("news@mail.brand.com"));
  assert.ok(!looksAutomated("ben.ortiz@stripe.com"));
  assert.ok(!looksAutomated("jane@google.com"));
});

test("address lists with quoted commas", () => {
  assert.deepEqual(
    parseAddressList(`"Chen, Sara" <sara@figma.com>, bob@x.com`),
    [
      { email: "sara@figma.com", name: "Sara Chen" },
      { email: "bob@x.com", name: undefined },
    ],
  );
  assert.deepEqual(parseListId("PM Community <pm.googlegroups.com>"), {
    id: "pm.googlegroups.com",
    name: "PM Community",
  });
});

test("gmail mapping: direction, bulk and mailing lists", () => {
  const acct = { id: "google:me@x.com", email: "me@x.com" };
  const mine = new Set(["me@x.com"]);
  const h = (headers: Record<string, string>) =>
    Object.entries(headers).map(([name, value]) => ({ name, value }));
  const out = mapGmailMessage(
    {
      id: "1",
      threadId: "t",
      internalDate: "0",
      labelIds: ["SENT"],
      payload: { headers: h({ From: "me@x.com", To: "a@b.com" }) },
    },
    acct,
    mine,
  )!;
  assert.equal(out.direction, "out");
  const bulk = mapGmailMessage(
    {
      id: "2",
      threadId: "t",
      internalDate: "0",
      payload: {
        headers: h({
          From: "a@b.com",
          To: "me@x.com",
          "List-Unsubscribe": "<x>",
        }),
      },
    },
    acct,
    mine,
  )!;
  assert.equal(bulk.isBulk, true);
  const list = mapGmailMessage(
    {
      id: "3",
      threadId: "t",
      internalDate: "0",
      payload: {
        headers: h({
          From: "a@b.com",
          To: "pm@googlegroups.com",
          "List-Id": "PM <pm.googlegroups.com>",
        }),
      },
    },
    acct,
    mine,
  )!;
  assert.equal(list.kind, "community_post");
  assert.equal(list.communityId, "list:pm.googlegroups.com");
});

test("calendar: skips declined and solo events", () => {
  const base = { id: "e", start: { dateTime: "2026-01-01T10:00:00Z" } };
  assert.equal(
    mapCalendarEvent(
      { ...base, attendees: [{ email: "me@x.com", self: true }] },
      { id: "a" },
    ),
    null,
  );
  assert.equal(
    mapCalendarEvent(
      {
        ...base,
        attendees: [
          { email: "me@x.com", self: true, responseStatus: "declined" },
          { email: "a@b.com" },
        ],
      },
      { id: "a" },
    ),
    null,
  );
  assert.equal(
    mapCalendarEvent(
      {
        ...base,
        attendees: [{ email: "me@x.com", self: true }, { email: "a@b.com" }],
      },
      { id: "a" },
    )?.participants.length,
    1,
  );
});

test("vcard 3.0 and 2.1 quoted-printable", () => {
  const cards = parseVcf(
    fs.readFileSync(
      path.join(import.meta.dirname, "../fixtures/phone.vcf"),
      "utf8",
    ),
  );
  assert.equal(cards.length, 3);
  assert.equal(cards[0].emails?.[0], "sara@figma.com");
  assert.equal(cards[2].name, "Lucía García");
});

test("linkedin csv with notes preamble and loose dates", () => {
  const rows = readCsv(
    fs.readFileSync(
      path.join(import.meta.dirname, "../fixtures/linkedin/Connections.csv"),
      "utf8",
    ),
    "First Name",
  );
  assert.equal(rows[0]["First Name"], "Sara");
  assert.equal(looseDate("12 Apr 2019"), "2019-04-12");
  assert.equal(looseDate("Mar 2019"), "2019-03");
});

test("x archive ytd parsing", () => {
  assert.deepEqual(
    parseYtd(`window.YTD.following.part0 = [{"following":{"accountId":"1"}}]`),
    [{ following: { accountId: "1" } }],
  );
});

test("pdl mapping keeps dated experience", () => {
  const p = mapPdl({
    full_name: "A B",
    linkedin_url: "linkedin.com/in/ab",
    twitter_url: "twitter.com/ab",
    experience: [
      {
        company: { name: "Shopify" },
        title: { name: "PM" },
        start_date: "2018-01",
        end_date: "2021-06",
      },
    ],
  });
  assert.equal(p.linkedinUrl, "https://linkedin.com/in/ab");
  assert.equal(p.xHandle, "ab");
  assert.deepEqual(p.positions?.[0], {
    company: "Shopify",
    title: "PM",
    start: "2018-01",
    end: "2021-06",
    current: false,
  });
});

test("fts query drops stopwords", () => {
  assert.equal(
    ftsQuery("who leads the support team?"),
    `"leads"* OR "support"* OR "team"*`,
  );
});

test("company keys fold renames and domains normalize", () => {
  assert.equal(canonicalKey("Facebook, Inc."), "meta");
  assert.equal(canonicalKey("Meta Platforms"), "meta");
  assert.equal(normalizeDomain("https://www.Shopify.com/about"), "shopify.com");
  assert.equal(normalizeDomain("not a domain"), null);
});

test("mobilize digest: comments, quoted original, group and community", async () => {
  const { parseMobilize } =
    await import("../src/sources/google/communityDigests.ts");
  const text = fs.readFileSync(
    path.join(import.meta.dirname, "../fixtures/mobilize/reply.txt"),
    "utf8",
  );
  const d = parseMobilize({
    text,
    subject: "[HR] Re: US : Background Verifications",
    cc: ["exhr@groups.mobilize.io"],
  })!;
  assert.equal(d.community, "Example Ventures CXO Community");
  assert.equal(d.group, "HR");
  assert.equal(d.title, "US : Background Verifications");
  assert.deepEqual(
    d.posts.map((p) => [p.author, p.company, p.original]),
    [
      ["Jordan Avery", "Northwind Labs", false],
      ["Casey Morgan", "Valence", false],
      ["Riley Quinn St. Clair", "Aivar", true],
    ],
  );
  const single = parseMobilize({
    text: "Is anyone using Trigger.dev in production?\n\nappreciates: 0 (x)\n\nSam Lee\nAcme Robotics\n\n[Join this discussion](x)\n\nYou’re receiving this message because you are a member of Example Ventures CXO Community.\n",
    subject: "[CTO] Trigger.dev — anyone using it?",
  })!;
  assert.deepEqual(
    single.posts.map((p) => [p.author, p.company, p.text]),
    [
      [
        "Sam Lee",
        "Acme Robotics",
        "Is anyone using Trigger.dev in production?",
      ],
    ],
  );
  assert.equal(single.group, "CTO");
});

test("gmail full payload: text/plain preferred, html fallback", async () => {
  const { messageText } =
    await import("../src/sources/google/communityDigests.ts");
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  assert.equal(
    messageText({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
        { mimeType: "text/plain", body: { data: b64("plain ’ text") } },
      ],
    }),
    "plain ’ text",
  );
  assert.equal(
    messageText({
      mimeType: "text/html",
      body: { data: b64("<p>Hi&nbsp;there</p><br>Bye") },
    }).trim(),
    "Hi there\n\nBye",
  );
});

test("pdl locked fields (true placeholders) are ignored", () => {
  const p = mapPdl({
    full_name: "Ann Lee",
    job_title: true,
    job_company_name: "Acme",
    location_locality: true,
    linkedin_url: true,
    twitter_url: true,
    skills: true,
    emails: true,
    work_email: true,
    experience: [
      {
        company: { name: "Acme", website: true },
        title: true,
        start_date: "2020-01",
        end_date: true,
        is_primary: true,
      },
    ],
    education: true,
  });
  assert.equal(p.title, undefined);
  assert.equal(p.city, undefined);
  assert.equal(p.linkedinUrl, undefined);
  assert.equal(p.company, "Acme");
  assert.deepEqual(p.positions, [
    { company: "Acme", start: "2020-01", current: true },
  ]);
});

test("enrichment skips inboxes, teams and organisations", async () => {
  const { looksLikePerson } = await import("../src/enrich/index.ts");
  for (const n of ["Sara Chen", "Daniel", "Mary-Jane O'Neil"])
    assert.equal(looksLikePerson(n), true, n);
  for (const n of [
    "info",
    "ClientServices",
    "notes@metaview.ai",
    "AngelList Wires Team",
    "TD Canada Trust",
    "Customer Success",
  ])
    assert.equal(looksLikePerson(n), false, n);
});

test("rate-limit wait comes from Retry-After or the reset header", async () => {
  const { waitFromHeaders } = await import("../src/enrich/http.ts");
  assert.equal(waitFromHeaders(new Headers({ "retry-after": "7" })), 7000);
  assert.equal(waitFromHeaders(new Headers({ "x-ratelimit-reset": "3" })), 3000);
  const reset = Math.floor(Date.now() / 1000) + 30;
  const w = waitFromHeaders(new Headers({ "x-ratelimit-reset": String(reset) }))!;
  assert.ok(w > 25_000 && w <= 31_000);
  assert.equal(waitFromHeaders(new Headers()), undefined);
});
