import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// End-to-end over the fictional demo network: importers → resolution → enrichment → graph → tools.
process.env.IGNYTE_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "brain-e2e-"),
);
const { loadDemo } = await import("../src/demo.ts");
const { toolByName } = await import("../src/agent/tools.ts");
const { all, get } = await import("../src/db/index.ts");
await loadDemo(() => {});
const call = async (name: string, input: object) =>
  (await toolByName.get(name)!.run(input as never)) as any;

test("one 'me' across work gmail, personal gmail, linkedin and x", () => {
  assert.equal(
    get<{ n: number }>("SELECT COUNT(*) AS n FROM people WHERE is_me = 1")!.n,
    1,
  );
});

test("newsletters and unanswered cold email do not become people", () => {
  const ids = all<{ value: string }>(
    "SELECT value FROM identifiers WHERE kind = 'email'",
  ).map((r) => r.value);
  assert.ok(!ids.includes("noreply@substack.com"));
  assert.ok(!ids.includes("jess@talentco.io"));
});

test("sources merge into single people", () => {
  const sara = all<{ id: string }>(
    "SELECT id FROM people WHERE display_name = 'Sara Chen'",
  );
  assert.equal(sara.length, 1);
  const sources = all<{ source: string }>(
    "SELECT DISTINCT source FROM observations WHERE person_id = ?",
    sara[0].id,
  ).map((s) => s.source);
  for (const s of ["google_contacts", "linkedin", "phone", "community"])
    assert.ok(sources.includes(s), `Sara missing ${s}`);
});

test("get into Shopify: You → Sara → Daniel with work-overlap evidence", async () => {
  const paths = await call("find_warm_paths", { company: "Shopify" });
  const viaSara = paths.find(
    (p: any) =>
      p.people.map((x: any) => x.name).join(">") ===
      "Mo Example>Sara Chen>Daniel Kim",
  );
  assert.ok(
    viaSara,
    JSON.stringify(paths.map((p: any) => p.people.map((x: any) => x.name))),
  );
  assert.ok(
    viaSara.hops[1].evidence.some((e: string) =>
      e.includes("Worked together at Shopify (2018–2021)"),
    ),
  );
  assert.ok(
    viaSara.hops[0].evidence.some((e: string) => e.startsWith("Met 2×")),
  );
});

test("first customers: support leaders ranked, with community context", async () => {
  const people = await call("search_people", {
    query: "head of support customer experience support lead",
  });
  const names = people.map((p: any) => p.name);
  for (const n of ["Ava Brooks", "Ben Ortiz", "Chloe Nguyen"])
    assert.ok(names.includes(n), `${n} missing from ${names}`);
  const cx = await call("communities", { name: "CX Leaders" });
  assert.deepEqual(cx.members.map((m: any) => m.name).sort(), [
    "Ava Brooks",
    "Ben Ortiz",
  ]);
});

test("trip: people and a community event in New York", async () => {
  const people = await call("search_people", { query: "", city: "New York" });
  assert.ok(people.some((p: any) => p.name === "Maya Williams"));
  const events = await call("upcoming", { days: 30, place: "New York" });
  assert.ok(
    events.some((e: any) => e.title === "Design Collective NYC gathering"),
  );
});

test("hidden opportunity: hiring signal and a candidate signal", async () => {
  const hiring = await call("search_activity", { query: "hiring PM" });
  assert.ok(hiring.some((a: any) => a.people?.includes("Priya Sharma")));
  const exploring = await call("search_activity", {
    query: "exploring product roles",
  });
  assert.ok(exploring.some((a: any) => a.people?.includes("Maya Williams")));
});

test("meeting prep: next meeting, shared communities, recent community post", async () => {
  const brief = await call("prep_meeting", { person: "Priya" });
  assert.equal(brief.name, "Priya Sharma");
  assert.ok(brief.next_meeting?.title.includes("Priya"));
  assert.deepEqual(brief.shared_communities_with_you.sort(), [
    "Product Manager Community",
    "Women in Product",
  ]);
  assert.ok(
    brief.recent_community_posts.some((p: any) =>
      p.subject.includes("Hiring my first PM"),
    ),
  );
});

test("done it before: SOC 2 post by Omar, reachable through Leo", async () => {
  const posts = await call("search_activity", { query: "SOC 2" });
  assert.ok(
    posts.some(
      (p: any) =>
        p.people?.includes("Omar Haddad") && p.community === "Founders Circle",
    ),
  );
  const leo = await call("get_person", { person: "Leo Martinez" });
  assert.ok(
    leo.how_you_know_them.some((e: string) =>
      e.includes("You worked together at Acme"),
    ),
  );
  assert.ok(leo.knows.some((k: any) => k.name === "Omar Haddad"));
});

test("companies: one Shopify whether asked by name, alias or domain", async () => {
  const { findCompany, aliasCompany } =
    await import("../src/companies/index.ts");
  const a = findCompany("Shopify Inc.");
  assert.ok(a);
  assert.equal(findCompany("shopify.com")?.id, a.id);
  aliasCompany("Shopify Commerce", "Shopify");
  assert.equal(findCompany("Shopify Commerce")?.id, a.id);
  const c = await call("get_company", { company: "shopify.com" });
  assert.equal(c.name, "Shopify");
  assert.ok(c.current_people.some((p: any) => p.name === "Daniel Kim"));
  assert.ok(c.alumni.some((p: any) => p.name === "Sara Chen"));
  assert.ok(
    c.warm_paths.some((w: any) =>
      w.people.map((x: any) => x.name).includes("Sara Chen"),
    ),
  );
});

test("companies: warmest-first list filtered by industry", async () => {
  const fintech = await call("companies_where_i_know_people", {
    industry: "fintech",
  });
  assert.deepEqual(
    fintech.map((c: any) => c.name),
    ["Stripe"],
  );
  assert.equal(fintech[0].best_contact.name, "Ben Ortiz");
  const all = await call("companies_where_i_know_people", {});
  assert.ok(
    all.findIndex((c: any) => c.name === "Figma") <
      all.findIndex((c: any) => c.name === "Loom"),
  );
});
