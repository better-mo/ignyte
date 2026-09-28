/**
 * Loads a small fictional network through the real pipeline (same mappers, importers,
 * enrichment and graph code as live data) so everything can be tried without credentials.
 * Run with a throwaway data dir: IGNYTE_DATA_DIR=.demo npm run demo
 */
import path from "node:path";
import { APP_ROOT, config } from "./config.ts";
import { get, run, tx } from "./db/index.ts";
import { enrichPeople } from "./enrich/index.ts";
import { mapPdl, providers } from "./enrich/providers.ts";
import { linkedinSlug } from "./identity/normalize.ts";
import { saveInteraction, upsertObservation } from "./identity/store.ts";
import { rebuild } from "./pipeline.ts";
import {
  mapCalendarEvent,
  type CalendarEvent,
} from "./sources/google/calendar.ts";
import {
  mapGooglePerson,
  type GooglePerson,
} from "./sources/google/contacts.ts";
import { mapGmailMessage, type GmailMessage } from "./sources/google/gmail.ts";
import {
  importCommunityActivity,
  importCommunityMembers,
} from "./sources/communities.ts";
import { importLinkedIn } from "./sources/linkedin.ts";
import { importVcf } from "./sources/vcard.ts";
import { importX } from "./sources/x.ts";

const FIX = path.join(APP_ROOT, "fixtures");
const day = 864e5;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day);

const WORK = {
  id: "google:mo@ignyte.dev",
  email: "mo@ignyte.dev",
  label: "Work",
};
const PERSONAL = {
  id: "google:mo.personal@gmail.com",
  email: "mo.personal@gmail.com",
  label: "Personal",
};
const ME = "Mo Example";

let seq = 0;
function mail(
  account: typeof WORK,
  daysAgo: number,
  from: string,
  to: string[],
  subject: string,
  snippet: string,
  opts: { cc?: string[]; thread?: string; bulk?: boolean } = {},
): GmailMessage {
  const headers = [
    { name: "From", value: from },
    { name: "To", value: to.join(", ") },
    { name: "Subject", value: subject },
    ...(opts.cc ? [{ name: "Cc", value: opts.cc.join(", ") }] : []),
    ...(opts.bulk
      ? [{ name: "List-Unsubscribe", value: "<mailto:unsub@x.com>" }]
      : []),
  ];
  const fromMe = from.includes(account.email);
  return {
    id: `m${++seq}`,
    threadId: opts.thread ?? `t${seq}`,
    labelIds: fromMe ? ["SENT"] : ["INBOX"],
    snippet,
    internalDate: String(at(daysAgo).getTime()),
    payload: { headers },
  };
}

function gmailFixtures() {
  const me = `${ME} <mo@ignyte.dev>`;
  const mePersonal = `${ME} <mo.personal@gmail.com>`;
  const w: GmailMessage[] = [];
  const p: GmailMessage[] = [];
  // Sara: long-running, two-way.
  for (let i = 0; i < 8; i++) {
    const t = `sara-${i}`;
    w.push(
      mail(
        WORK,
        4 + i * 60,
        "Sara Chen <sara@figma.com>",
        [me],
        [
          "Coffee next week?",
          "Roadmap feedback",
          "PM Community talk",
          "Quick q on pricing",
        ][i % 4],
        "Would love your take on this…",
        { thread: t },
      ),
    );
    w.push(
      mail(
        WORK,
        3 + i * 60,
        me,
        ["Sara Chen <sara@figma.com>"],
        `Re: ${["Coffee next week?", "Roadmap feedback", "PM Community talk", "Quick q on pricing"][i % 4]}`,
        "Sounds great, let's do it.",
        { thread: t },
      ),
    );
  }
  // The intro thread that links Sara and Daniel.
  w.push(
    mail(
      WORK,
      240,
      me,
      ["Sara Chen <sara@figma.com>"],
      "Design systems at scale",
      "Sara — you mentioned Daniel ran design systems with you at Shopify…",
      { thread: "sd", cc: ["Daniel Kim <daniel.kim@shopify.com>"] },
    ),
  );
  w.push(
    mail(
      WORK,
      239,
      "Daniel Kim <daniel.kim@shopify.com>",
      [me],
      "Re: Design systems at scale",
      "Happy to share what we learned. Sara and I worked on Polaris together.",
      { thread: "sd", cc: ["Sara Chen <sara@figma.com>"] },
    ),
  );
  // Priya: hiring signal, plus Nina on a thread.
  w.push(
    mail(
      WORK,
      10,
      "Priya Sharma <priya@linear.app>",
      [me],
      "Hiring a founding PM?",
      "We're about to hire our first PM — do you know anyone great with design sense?",
      { thread: "pr1" },
    ),
  );
  w.push(
    mail(
      WORK,
      9,
      me,
      ["Priya Sharma <priya@linear.app>"],
      "Re: Hiring a founding PM?",
      "Yes! Let me think — a couple of people come to mind.",
      { thread: "pr1" },
    ),
  );
  w.push(
    mail(
      WORK,
      120,
      "Priya Sharma <priya@linear.app>",
      [me],
      "Linear x Ignyte",
      "Nina from our eng team would love to see a demo.",
      { thread: "pr2", cc: ["Nina Patel <nina@linear.app>"] },
    ),
  );
  w.push(
    mail(
      WORK,
      119,
      me,
      ["Priya Sharma <priya@linear.app>", "Nina Patel <nina@linear.app>"],
      "Re: Linear x Ignyte",
      "Happy to — how's Thursday?",
      { thread: "pr2" },
    ),
  );
  // Support leaders.
  w.push(
    mail(
      WORK,
      30,
      "Ava Brooks <ava@notion.so>",
      [me],
      "Support tooling feedback",
      "Our team of 40 agents is drowning in macros…",
      { thread: "ava" },
    ),
  );
  w.push(
    mail(
      WORK,
      29,
      me,
      ["Ava Brooks <ava@notion.so>"],
      "Re: Support tooling feedback",
      "This is exactly the problem we're looking at.",
      { thread: "ava" },
    ),
  );
  w.push(
    mail(
      WORK,
      150,
      me,
      ["Ben Ortiz <ben.ortiz@stripe.com>"],
      "CX Leaders follow-up",
      "Great chatting at the CX Leaders meetup.",
      { thread: "ben" },
    ),
  );
  w.push(
    mail(
      WORK,
      148,
      "Ben Ortiz <ben.ortiz@stripe.com>",
      [me],
      "Re: CX Leaders follow-up",
      "Likewise — our support org is rethinking tooling in Q4.",
      { thread: "ben" },
    ),
  );
  w.push(
    mail(
      WORK,
      95,
      me,
      ["Chloe Nguyen <chloe@loom.com>"],
      "Support ops chat",
      "Would love 20 minutes on how you run support at Loom.",
      { thread: "chloe" },
    ),
  );
  w.push(
    mail(
      WORK,
      93,
      "Chloe Nguyen <chloe@loom.com>",
      [me],
      "Re: Support ops chat",
      "Sure — I lead support here, happy to help.",
      { thread: "chloe" },
    ),
  );
  // Noise that must not become people.
  w.push(
    mail(
      WORK,
      2,
      "Substack <noreply@substack.com>",
      [me],
      "Your weekly digest",
      "Top posts this week",
      { bulk: true },
    ),
  );
  w.push(
    mail(
      WORK,
      20,
      "Recruiter <jess@talentco.io>",
      [me],
      "Opportunity",
      "Are you open to a new role?",
    ),
  );
  w.push(
    mail(
      WORK,
      12,
      "Recruiter <jess@talentco.io>",
      [me],
      "Following up",
      "Just bumping this.",
    ),
  );
  // Personal inbox.
  p.push(
    mail(
      PERSONAL,
      45,
      "Maya Williams <maya@forma.studio>",
      [mePersonal],
      "Pitch deck",
      "Could you send the deck you mentioned?",
      { thread: "maya" },
    ),
  );
  p.push(
    mail(
      PERSONAL,
      44,
      mePersonal,
      ["Maya Williams <maya@forma.studio>"],
      "Re: Pitch deck",
      "Of course, sending tonight.",
      { thread: "maya" },
    ),
  );
  p.push(
    mail(
      PERSONAL,
      60,
      mePersonal,
      ["Leo Martinez <leo@gather.so>"],
      "Running Sunday?",
      "Usual loop at 8?",
      { thread: "leo" },
    ),
  );
  p.push(
    mail(
      PERSONAL,
      59,
      "Leo Martinez <leo@gather.so>",
      [mePersonal],
      "Re: Running Sunday?",
      "Yes! Also — we just finished SOC 2 prep with Omar's help.",
      { thread: "leo" },
    ),
  );
  return { w, p };
}

function calendarFixtures(): CalendarEvent[] {
  const ev = (
    id: string,
    daysAgo: number,
    summary: string,
    people: [string, string][],
    location?: string,
  ): CalendarEvent => ({
    id,
    summary,
    location,
    start: { dateTime: at(daysAgo).toISOString() },
    end: { dateTime: new Date(at(daysAgo).getTime() + 3600e3).toISOString() },
    organizer: { email: "mo@ignyte.dev", self: true },
    attendees: [
      { email: "mo@ignyte.dev", self: true, responseStatus: "accepted" },
      ...people.map(([email, displayName]) => ({
        email,
        displayName,
        responseStatus: "accepted",
      })),
    ],
  });
  return [
    ev(
      "e1",
      90,
      "Coffee with Sara",
      [["sara@figma.com", "Sara Chen"]],
      "Toronto",
    ),
    ev(
      "e2",
      30,
      "Sara / Mo catch-up",
      [["sara@figma.com", "Sara Chen"]],
      "Toronto",
    ),
    ev("e3", 60, "Priya <> Mo", [["priya@linear.app", "Priya Sharma"]]),
    ev(
      "e4",
      120,
      "Founders dinner",
      [
        ["leo@gather.so", "Leo Martinez"],
        ["omar@vanta.com", "Omar Haddad"],
        ["tom@northstar.vc", "Tom Becker"],
      ],
      "Toronto",
    ),
    ev(
      "e5",
      -3,
      "Coffee with Priya",
      [["priya@linear.app", "Priya Sharma"]],
      "San Francisco",
    ),
    ev("e6", 20, "Ava / Mo: support tooling", [
      ["ava@notion.so", "Ava Brooks"],
    ]),
  ];
}

const contactFixtures: GooglePerson[] = [
  {
    resourceName: "people/c1",
    names: [
      { displayName: "Sara Chen", givenName: "Sara", familyName: "Chen" },
    ],
    emailAddresses: [{ value: "sara@figma.com" }],
    phoneNumbers: [{ value: "+14165550101" }],
    organizations: [{ name: "Figma", title: "Product Lead" }],
    addresses: [{ city: "Toronto", region: "ON", country: "Canada" }],
    urls: [{ value: "https://www.linkedin.com/in/sarachen-pm" }],
  },
  {
    resourceName: "people/c2",
    names: [{ displayName: "Priya Sharma" }],
    emailAddresses: [
      { value: "priya@linear.app" },
      { value: "priya.sharma@gmail.com" },
    ],
    organizations: [{ name: "Linear", title: "Head of Product" }],
    addresses: [{ city: "San Francisco", region: "CA", country: "USA" }],
  },
  {
    resourceName: "people/c3",
    names: [{ displayName: "Leo Martinez" }],
    emailAddresses: [{ value: "leo@gather.so" }],
    phoneNumbers: [{ value: "+1 416-555-0199" }],
  },
  {
    resourceName: "people/c4",
    names: [{ displayName: "Maya Williams" }],
    emailAddresses: [{ value: "maya@forma.studio" }],
    addresses: [{ city: "New York", region: "NY", country: "USA" }],
  },
  {
    resourceName: "people/c5",
    names: [{ displayName: "Ava Brooks" }],
    emailAddresses: [{ value: "ava@notion.so" }],
    organizations: [{ name: "Notion", title: "Head of Support" }],
    addresses: [{ city: "San Francisco" }],
  },
  {
    resourceName: "people/c6",
    names: [{ displayName: "Ben Ortiz" }],
    emailAddresses: [{ value: "ben.ortiz@stripe.com" }],
    organizations: [{ name: "Stripe", title: "VP Customer Experience" }],
    addresses: [{ city: "New York" }],
  },
];

const exp = (
  company: string,
  title: string,
  start: string,
  end?: string,
  website?: string,
) => ({
  company: { name: company, website },
  title: { name: title },
  start_date: start,
  end_date: end ?? null,
  is_primary: !end,
});
const pdlFixtures: Record<string, any> = {
  "sara@figma.com": {
    full_name: "Sara Chen",
    job_title: "Product Lead",
    job_company_name: "Figma",
    location_locality: "Toronto",
    location_region: "Ontario",
    location_country: "Canada",
    linkedin_url: "linkedin.com/in/sarachen-pm",
    skills: ["product management", "design systems"],
    experience: [
      exp("Figma", "Product Lead", "2021-07"),
      exp(
        "Shopify",
        "Senior Product Manager",
        "2018-01",
        "2021-06",
        "shopify.com",
      ),
    ],
  },
  "daniel.kim@shopify.com": {
    full_name: "Daniel Kim",
    job_title: "Design Director",
    job_company_name: "Shopify",
    location_locality: "Toronto",
    location_country: "Canada",
    linkedin_url: "linkedin.com/in/danielkim-design",
    experience: [
      exp("Shopify", "Design Director", "2017-03", undefined, "shopify.com"),
    ],
  },
  "priya@linear.app": {
    full_name: "Priya Sharma",
    job_title: "Head of Product",
    job_company_name: "Linear",
    location_locality: "San Francisco",
    location_country: "United States",
    experience: [
      exp("Linear", "Head of Product", "2022-01"),
      exp("Stripe", "Product Manager", "2017-02", "2021-12"),
    ],
  },
  "maya@forma.studio": {
    full_name: "Maya Williams",
    job_title: "Founder",
    job_company_name: "Forma",
    location_locality: "New York",
    location_country: "United States",
    experience: [
      exp("Forma", "Founder", "2021-01"),
      exp("IDEO", "Design Lead", "2015-06", "2020-12"),
    ],
  },
  "leo@gather.so": {
    full_name: "Leo Martinez",
    job_title: "Founder",
    job_company_name: "Gather",
    location_locality: "Toronto",
    location_country: "Canada",
    twitter_url: "twitter.com/leomtz",
    experience: [
      exp("Gather", "Founder", "2020-03"),
      exp("Acme", "Engineering Lead", "2016-05", "2020-02"),
    ],
  },
  "nina@linear.app": {
    full_name: "Nina Patel",
    job_title: "Engineering Manager",
    job_company_name: "Linear",
    location_locality: "San Francisco",
    experience: [exp("Linear", "Engineering Manager", "2021-04")],
  },
  "ava@notion.so": {
    full_name: "Ava Brooks",
    job_title: "Head of Support",
    job_company_name: "Notion",
    location_locality: "San Francisco",
    experience: [exp("Notion", "Head of Support", "2021-01")],
  },
  "ben.ortiz@stripe.com": {
    full_name: "Ben Ortiz",
    job_title: "VP Customer Experience",
    job_company_name: "Stripe",
    location_locality: "New York",
    experience: [exp("Stripe", "VP Customer Experience", "2019-09")],
  },
  "chloe@loom.com": {
    full_name: "Chloe Nguyen",
    job_title: "Support Lead",
    job_company_name: "Loom",
    location_locality: "Toronto",
    experience: [exp("Loom", "Support Lead", "2022-02")],
  },
  "omar@vanta.com": {
    full_name: "Omar Haddad",
    job_title: "CTO",
    job_company_name: "Vanta",
    location_locality: "San Francisco",
    experience: [
      exp("Vanta", "CTO", "2019-01"),
      exp("Stripe", "Staff Engineer", "2015-01", "2018-12"),
    ],
  },
};

export async function loadDemo(log = console.log) {
  if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM people")?.n ?? 0) > 0) {
    throw new Error(
      `${config.dbPath} already has people. Use an empty IGNYTE_DATA_DIR for the demo.`,
    );
  }
  tx(() => {
    for (const a of [WORK, PERSONAL]) {
      run(
        "INSERT OR IGNORE INTO accounts (id, provider, label, email, tokens) VALUES (?, 'google', ?, ?, '{}')",
        a.id,
        a.label,
        a.email,
      );
      upsertObservation(
        "me",
        a.id,
        "self",
        { name: ME, emails: [a.email] },
        { isMe: true },
      );
    }
    const mine = new Set([WORK.email, PERSONAL.email]);
    const { w, p } = gmailFixtures();
    for (const m of w) saveInteraction(mapGmailMessage(m, WORK, mine)!);
    for (const m of p) saveInteraction(mapGmailMessage(m, PERSONAL, mine)!);
    for (const e of calendarFixtures())
      saveInteraction(mapCalendarEvent(e, WORK)!);
    for (const c of contactFixtures)
      upsertObservation(
        "google_contacts",
        WORK.id,
        c.resourceName,
        mapGooglePerson(c),
      );
  });
  log(
    "  demo: loaded Gmail, Calendar and Contacts fixtures for 2 Google accounts",
  );
  importLinkedIn(path.join(FIX, "linkedin"), log);
  await importX(path.join(FIX, "x"), log, [
    {
      id: "2001",
      username: "jwilson",
      name: "James Wilson",
      description: "Staff engineer. Useful AI.",
    },
    {
      id: "2002",
      username: "leomtz",
      name: "Leo Martinez",
      description: "Building Gather",
    },
    { id: "2003", username: "chloenguyen", name: "Chloe Nguyen" },
  ]);
  importVcf(path.join(FIX, "phone.vcf"), log);
  importCommunityMembers(path.join(FIX, "communities.csv"), log);
  importCommunityActivity(path.join(FIX, "community-activity.csv"), log);
  await rebuild(log, { embed: false });

  // Offline stand-in for PDL: same response shape, same mapper.
  providers.fixture = {
    name: "fixture",
    async enrich(q) {
      const slug = linkedinSlug(q.linkedinUrl);
      const key =
        q.emails.find((e) => pdlFixtures[e]) ??
        (slug
          ? Object.keys(pdlFixtures).find((k) =>
              pdlFixtures[k].linkedin_url?.endsWith(`/in/${slug}`),
            )
          : undefined);
      return key
        ? {
            status: "matched",
            profile: mapPdl(pdlFixtures[key]),
            raw: pdlFixtures[key],
          }
        : { status: "no_match" };
    },
  };
  await enrichPeople({ provider: "fixture", minStrength: 0, limit: 100 }, log);
  await rebuild(log);
}

if (process.argv[1]?.endsWith("demo.ts")) {
  loadDemo().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
