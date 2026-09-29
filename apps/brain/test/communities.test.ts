import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.IGNYTE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "brain-comm-"));
const { classifyMessage, rankCandidates } = await import("../src/communities/detect.ts");

const ctx = { mine: new Set(["me@acme.io", "me@gmail.com"]), myDomains: new Set(["acme.io"]) };
const msg = (over: any) => ({
  id: "m",
  from: { email: "x@example.com" },
  to: [{ email: "me@acme.io" }],
  cc: [],
  subject: "",
  snippet: "",
  occurredAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

test("Mobilize group mail maps to the known community and its group", () => {
  const [s] = classifyMessage(
    msg({
      from: { email: "jane.bvp@members.mobilize.io", name: "Jane Doe" },
      to: [],
      cc: [{ email: "bvpcfo@groups.mobilize.io" }],
      subject: "[CFO] Re: Audit firms for SOC 2",
    }),
    ctx,
  );
  assert.equal(s.name, "Bessemer Venture Partners CXO Community");
  assert.equal(s.group, "CFO");
  assert.equal(s.kind, "message");
  // Your own reply to the group is the strongest signal.
  const [mine] = classifyMessage(
    msg({ from: { email: "me@acme.io" }, to: [{ email: "bvpgtm@groups.mobilize.io" }], subject: "[GTM] Re: AE comp" }),
    ctx,
  );
  assert.equal(mine.kind, "post");
  assert.equal(mine.group, "GTM");
});

test("Luma calendars and hosted events", () => {
  const [cal] = classifyMessage(
    msg({ from: { email: "torontotechweek@calendar.luma-mail.com", name: "Toronto Tech Week" }, subject: "Day 1 recap" }),
    ctx,
  );
  assert.equal(cal.name, "Toronto Tech Week");
  const [unknown] = classifyMessage(
    msg({ from: { email: "founders-dinner@calendar.luma-mail.com", name: "Founders Dinner Club" }, subject: "You're registered for March dinner" }),
    ctx,
  );
  assert.equal(unknown.name, "Founders Dinner Club");
  assert.equal(unknown.kind, "registered");
  const [host] = classifyMessage(
    msg({
      from: { email: "usr-abc@user.luma-mail.com", name: "Julia K" },
      subject: "The Summer Party Hosted by Golden Ventures & Crosslink Capital is starting in 1 hour",
    }),
    ctx,
  );
  assert.equal(host.name, "Golden Ventures");
  assert.equal(host.kind, "registered");
  const [circle] = classifyMessage(
    msg({
      from: { email: "usr-def@user.luma-mail.com", name: "Sam Host" },
      subject: "Invite Only - Toronto Persian Execs Circle is starting tomorrow",
    }),
    ctx,
  );
  assert.equal(circle.name, "Toronto Persian Execs Circle");
});

test("Slack invites count; Slack Connect and your own workspace don't", () => {
  const [ws] = classifyMessage(
    msg({ from: { email: "feedback@slack.com" }, subject: "Join Buffer Community on Slack", snippet: "Arielle has invited you to join the Slack workspace Buffer Community." }),
    ctx,
  );
  assert.equal(ws.name, "Buffer Community");
  assert.equal(ws.kind, "invite");
  assert.equal(
    classifyMessage(msg({ from: { email: "feedback@slack.com" }, snippet: "Dan from Drata would like to work together in a Slack channel" }), ctx).length,
    0,
  );
  assert.equal(
    classifyMessage(msg({ from: { email: "feedback@slack.com" }, subject: "Join Acme Team on Slack" }), ctx).length,
    0,
  );
});

test("mail sent to a colleague is not your community", () => {
  assert.equal(
    classifyMessage(
      msg({ from: { email: "events@cmxhub.com" }, to: [{ email: "colleague@acme.io" }], subject: "CMX Connect digest" }),
      ctx,
    ).length,
    0,
  );
  const [cmx] = classifyMessage(msg({ from: { email: "events@cmxhub.com" }, subject: "CMX Connect digest" }), ctx);
  assert.equal(cmx.name, "CMX");
});

test("Discourse forums and newsletters", () => {
  const [d] = classifyMessage(
    msg({ from: { email: "notifications@elfsight.discoursemail.com" }, subject: "[Elfsight Community] Summary" }),
    ctx,
  );
  assert.equal(d.name, "Elfsight Community");
  assert.equal(classifyMessage(msg({ from: { email: "noreply@substack.com" }, subject: "New post" }), ctx).length, 0);
});

test("ranking rolls groups up and puts involvement first", () => {
  const now = Date.parse("2026-09-01");
  const s = (key: string, kind: string, date: string, extra: any = {}) => ({
    key, name: key, platform: "x", type: "other", kind, occurredAt: date, subject: `${key} ${date}`, ...extra,
  });
  const signals = [
    ...["2026-01", "2026-03", "2026-05", "2026-07"].map((m) => s("bvp", "message", `${m}-02T00:00:00Z`, { group: "CFO" })),
    s("bvp", "post", "2026-08-01T00:00:00Z", { group: "GTM" }),
    s("summit", "speaker", "2025-11-01T00:00:00Z"),
    ...Array.from({ length: 10 }, (_, i) => s("newsy", "message", `2026-08-${10 + i}T00:00:00Z`)),
    s("old", "message", "2021-01-01T00:00:00Z"),
  ];
  const ranked = rankCandidates(signals as any, now);
  assert.deepEqual(ranked[0].evidence.groups, ["CFO", "GTM"]);
  assert.equal(ranked[0].key, "bvp");
  assert.equal(ranked[0].role, "active member");
  assert.equal(ranked.find((c) => c.key === "summit")!.role, "speaker");
  assert.equal(ranked.at(-1)!.key, "old");
});

test("hosted-by names stop at the event wording", () => {
  const [s] = classifyMessage(
    msg({
      from: { email: "usr-x@user.luma-mail.com", name: "Pat" },
      subject: "Reminder",
      snippet: "Breakfast Hosted by Product Guild is tomorrow at 9",
    }),
    ctx,
  );
  assert.equal(s.name, "Product Guild");
});

test("an unknown Mobilize group is renamed from its community footer", async () => {
  const { saveSignals, resolveMobilizeGroup, refreshCandidates } = await import("../src/communities/detect.ts");
  const signals = classifyMessage(
    msg({ from: { email: "a.x@members.mobilize.io", name: "A X" }, to: [], cc: [{ email: "acmeops@groups.mobilize.io" }], subject: "[Ops] Vendors?" }),
    ctx,
  );
  assert.equal(signals[0].key, "mobilize:acmeops");
  saveSignals("acct", "m1", signals);
  resolveMobilizeGroup("acmeops", "Acme Founders Network", "Ops");
  const [c] = refreshCandidates();
  assert.equal(c.name, "Acme Founders Network");
  assert.deepEqual(c.evidence.groups, ["Ops"]);
});
