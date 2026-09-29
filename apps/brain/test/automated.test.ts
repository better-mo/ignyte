import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.IGNYTE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "brain-auto-"));
const { automatedAddressReason, isRelayedName, looksLikePerson } = await import("../src/identity/automated.ts");
const { isMachineSender, worthPromoting } = await import("../src/identity/promote.ts");

test("service and robot addresses are not people", () => {
  for (const e of [
    "dse_na3@docusign.net",
    "12345678@bcc.hubspot.com",
    "notifications@github.com",
    "comments-noreply@docs.google.com",
    "calendar-notification@google.com",
    "billing-eu@acme.io",
    "support2@tinyco.com",
    "team@startup.dev",
    "bounces+83921-ab12@mail.vendor.com",
    "a8f3c9e1b2d4f6a8c0e1@sendvendor.com",
    "jira@acme.atlassian.net",
    "help@acme.zendesk.com",
    "fred@fireflies.ai",
    "hello@newsletter.brand.com",
  ])
    assert.ok(automatedAddressReason(e), e);
});

test("real people, including at big SaaS companies, stay people", () => {
  for (const e of [
    "sara.chen@stripe.com",
    "jmiller@notion.so",
    "ali@github.com",
    "mo@tinystartup.ai",
    "priya@figma.com",
    "dan.k@gmail.com",
    "maria@zendesk.com",
    "ceo@acme.io".replace("ceo", "kim"),
  ])
    assert.equal(automatedAddressReason(e), null, e);
});

test("relayed and organisation names", () => {
  assert.equal(isRelayedName("Jane Smith via Docusign"), true);
  assert.equal(isRelayedName("Jane Smith (Google Docs)"), true);
  assert.equal(isRelayedName("Jane Smith"), false);
  for (const n of ["Fireflies.ai Notetaker", "Read.ai meeting notes", "DocuSign Team", "TD Canada Trust", "Board Room (8)"])
    assert.equal(looksLikePerson(n), false, n);
  for (const n of ["Sara Chen", "Viadana Rossi", "Omar"]) assert.equal(looksLikePerson(n), true, n);
});

test("behaviour: bulk-only senders are machines, two-way contact is a person", () => {
  const base = { inbound: 0, inbound_bulk: 0, direct_out: 0, cc_out: 0, replied: 0, meetings: 0, posts: 0 };
  assert.equal(isMachineSender({ ...base, inbound: 12, inbound_bulk: 11 }), true);
  assert.equal(isMachineSender({ ...base, inbound: 12, inbound_bulk: 11, direct_out: 1 }), false);
  assert.equal(worthPromoting({ ...base, cc_out: 3 }), false); // only ever cc'd
  assert.equal(worthPromoting({ ...base, replied: 1 }), false); // one stray reply
  assert.equal(worthPromoting({ ...base, direct_out: 1 }), true);
  assert.equal(worthPromoting({ ...base, meetings: 1 }), true);
});
