import { z } from "zod";
import { all, get, run } from "../db/index.ts";
import {
  brief,
  findWarmPaths,
  getPerson,
  me,
  myEvidence,
  neighbors,
  pairEvidence,
  peopleAtCompany,
  sharedCommunities,
} from "../graph/query.ts";
import { indexDocuments } from "../index/documents.ts";
import { searchActivity, searchPeople } from "../index/search.ts";
import type { PersonRow } from "../model.ts";

export type ToolDef<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<unknown> | unknown;
  /** Writes data; MCP marks it non-read-only. */
  writes?: boolean;
};

const tool = <S extends z.ZodObject>(t: ToolDef<S>) => t as unknown as ToolDef;

const compact = (p: PersonRow, extra: Record<string, unknown> = {}) => ({
  id: p.id,
  name: p.display_name,
  headline: p.headline,
  city: p.city,
  strength: p.strength,
  tier: p.tier,
  trend: p.trend,
  last_contact: p.last_interaction_at?.slice(0, 10) ?? null,
  ...extra,
});

function resolvePerson(
  idOrName: string,
): PersonRow | { ambiguous: ReturnType<typeof compact>[] } | null {
  const byId = getPerson(idOrName);
  if (byId) return byId;
  const rows = all<PersonRow>(
    "SELECT * FROM people WHERE is_me = 0 AND hidden = 0 AND display_name LIKE ? ORDER BY strength DESC LIMIT 6",
    `%${idOrName}%`,
  );
  if (
    rows.length === 1 ||
    (rows.length > 1 && rows[0].strength >= rows[1].strength * 2)
  )
    return rows[0];
  return rows.length ? { ambiguous: rows.map((r) => compact(r)) } : null;
}

const recentInteractions = (personId: string, limit = 8) =>
  all<{
    kind: string;
    source: string;
    occurred_at: string;
    direction: string;
    subject: string | null;
    snippet: string | null;
    community: string | null;
    url: string | null;
  }>(
    `SELECT i.kind, i.source, i.occurred_at, i.direction, i.subject, substr(i.snippet, 1, 240) AS snippet, c.name AS community, i.url
     FROM participants pa JOIN interactions i ON i.id = pa.interaction_id
     LEFT JOIN communities c ON c.id = i.community_id
     WHERE pa.person_id = ? AND i.is_bulk = 0 AND i.kind NOT IN ('follow', 'connected') AND i.occurred_at <= datetime('now')
     GROUP BY i.id ORDER BY i.occurred_at DESC LIMIT ?`,
    personId,
    limit,
  );

export function personProfile(p: PersonRow) {
  const self = me();
  return {
    ...compact(p),
    title: p.title,
    company: p.company,
    location: [p.city, p.region, p.country].filter(Boolean).join(", ") || null,
    linkedin: p.linkedin_url,
    x: p.x_handle ? `@${p.x_handle}` : null,
    summary: p.summary?.slice(0, 800) ?? null,
    identities: all<{ kind: string; value: string; source: string }>(
      "SELECT kind, value, source FROM identifiers WHERE person_id = ?",
      p.id,
    ),
    sources: all<{ source: string }>(
      "SELECT DISTINCT source FROM observations WHERE person_id = ?",
      p.id,
    ).map((s) => s.source),
    career: all(
      "SELECT company, title, start_date, end_date, is_current, source FROM employment WHERE person_id = ? ORDER BY is_current DESC, start_date DESC",
      p.id,
    ),
    education: all(
      "SELECT school, degree, start_date, end_date FROM education WHERE person_id = ?",
      p.id,
    ),
    communities: all<{ name: string }>(
      "SELECT c.name FROM memberships m JOIN communities c ON c.id = m.community_id WHERE m.person_id = ?",
      p.id,
    ).map((c) => c.name),
    shared_communities_with_you: self
      ? sharedCommunities(self.id, p.id).map((c) => c.name)
      : [],
    how_you_know_them: myEvidence(p.id),
    recent_interactions: recentInteractions(p.id),
    notes: all(
      "SELECT body, source, created_at FROM notes WHERE person_id = ? ORDER BY created_at DESC LIMIT 10",
      p.id,
    ),
    knows: neighbors(p.id)
      .slice(0, 8)
      .map((n) => {
        const other = getPerson(n.id);
        return other && !other.hidden
          ? { ...compact(other), evidence: pairEvidence(p.id, n.id).lines }
          : null;
      })
      .filter(Boolean),
    enriched_by: all<{ provider: string; fetched_at: string }>(
      "SELECT provider, fetched_at FROM enrichments WHERE person_id = ? AND status = 'matched'",
      p.id,
    ),
  };
}

export const tools: ToolDef[] = [
  tool({
    name: "search_people",
    description:
      "Search your network by meaning and keywords (role, skills, company, topic, place, community), with optional filters. " +
      "Returns the best matches with relationship strength. Use for shortlists like 'people who lead support teams' or 'designers in New York'.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "Free-text description of who you're looking for. Can be empty when only filtering.",
        ),
      city: z.string().optional().describe("City, region or country filter"),
      company: z.string().optional().describe("Current or past company filter"),
      community: z.string().optional().describe("Community name filter"),
      min_strength: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Minimum relationship strength 0-100"),
      include_weak_ties: z
        .boolean()
        .optional()
        .describe(
          "Include people with no direct interaction (e.g. community-only members)",
        ),
      limit: z.number().int().min(1).max(40).optional(),
    }),
    async run(i) {
      const results = await searchPeople(
        i.query,
        {
          city: i.city,
          company: i.company,
          community: i.community,
          minStrength: i.min_strength,
          includeWeak: i.include_weak_ties,
        },
        i.limit ?? 15,
      );
      return results.map((r) =>
        compact(r.person, {
          matched_by: r.matchedBy,
          company: r.person.company,
        }),
      );
    },
  }),

  tool({
    name: "get_person",
    description:
      "Full profile of one person: career, education, communities, how you know them (with evidence), recent interactions, notes, and who they know in your network.",
    schema: z.object({
      person: z.string().describe("Person id (p_...) or name"),
    }),
    run(i) {
      const p = resolvePerson(i.person);
      if (!p) return { error: `No one matching "${i.person}"` };
      if ("ambiguous" in p)
        return {
          ambiguous: p.ambiguous,
          hint: "Call again with one of these ids.",
        };
      return personProfile(p);
    },
  }),

  tool({
    name: "who_do_i_know_at",
    description:
      "Everyone in your network who works at a company now (and optionally in the past), with role and relationship strength.",
    schema: z.object({
      company: z
        .string()
        .describe("Company name or domain, e.g. 'Shopify' or 'shopify.com'"),
      include_past: z
        .boolean()
        .optional()
        .describe("Include former employees (default true)"),
    }),
    run(i) {
      return peopleAtCompany(i.company, i.include_past ?? true)
        .slice(0, 40)
        .map((r) =>
          compact(r.person, {
            role_at_company: r.role,
            current: r.current,
            how_you_know_them: myEvidence(r.person.id).slice(0, 3),
          }),
        );
    },
  }),

  tool({
    name: "find_warm_paths",
    description:
      "Warm introduction paths from you to a company or a specific person: direct ties, you → friend → target, or 3 hops. " +
      "Each hop comes with evidence (meetings, emails, worked together, shared communities). A hop with confirmed=false is only community context.",
    schema: z.object({
      company: z.string().optional().describe("Target company"),
      person_id: z.string().optional().describe("Target person id"),
      limit: z.number().int().min(1).max(15).optional(),
    }),
    run(i) {
      if (!i.company && !i.person_id)
        return { error: "Provide company or person_id" };
      const paths = findWarmPaths({
        company: i.company,
        personId: i.person_id,
        limit: i.limit ?? 6,
      });
      return paths.map((p) => ({
        score: p.score,
        target_role: p.targetRole,
        people: p.people.map((x) => ({
          id: x.id,
          name: x.name,
          headline: x.headline,
          strength: x.strength,
        })),
        hops: p.hops.map((h) => ({
          from: h.from,
          to: h.to,
          confirmed: h.confirmed,
          evidence: h.evidence,
        })),
      }));
    },
  }),

  tool({
    name: "search_activity",
    description:
      "Search what people said or did: email subjects/snippets, DMs, LinkedIn messages, meetings, community posts and events. " +
      "Use for signals like 'hiring a PM', 'SOC 2', 'raising a round', 'moving to New York', or to find what someone discussed recently.",
    schema: z.object({
      query: z.string(),
      person_id: z.string().optional(),
      community: z
        .string()
        .optional()
        .describe("Limit to one community by name"),
      since: z.string().optional().describe("ISO date lower bound"),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    run(i) {
      const communityId = i.community
        ? get<{ id: string }>(
            "SELECT id FROM communities WHERE name LIKE ? LIMIT 1",
            `%${i.community}%`,
          )?.id
        : undefined;
      return searchActivity(i.query, {
        personId: i.person_id,
        since: i.since,
        communityId,
        limit: i.limit,
      });
    },
  }),

  tool({
    name: "communities",
    description:
      "List your communities (with member counts and whether you're a member), or the members of one community ranked by your relationship.",
    schema: z.object({
      name: z.string().optional().describe("Community name to list members of"),
    }),
    run(i) {
      const self = me();
      if (!i.name) {
        return all(
          `SELECT c.id, c.name, c.provider, COUNT(m.person_id) AS members,
                  MAX(CASE WHEN m.person_id = ? THEN 1 ELSE 0 END) AS you_are_member
           FROM communities c LEFT JOIN memberships m ON m.community_id = c.id GROUP BY c.id ORDER BY members DESC`,
          self?.id ?? "",
        );
      }
      const c = get<{ id: string; name: string }>(
        "SELECT id, name FROM communities WHERE name LIKE ? LIMIT 1",
        `%${i.name}%`,
      );
      if (!c) return { error: `No community matching "${i.name}"` };
      const members = all<PersonRow>(
        `SELECT p.* FROM memberships m JOIN people p ON p.id = m.person_id
         WHERE m.community_id = ? AND p.is_me = 0 AND p.hidden = 0 ORDER BY p.strength DESC LIMIT 50`,
        c.id,
      );
      return { community: c.name, members: members.map((m) => compact(m)) };
    },
  }),

  tool({
    name: "upcoming",
    description:
      "Upcoming meetings from your calendars and community events, optionally filtered by place (for trips) or by person.",
    schema: z.object({
      days: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe("Look-ahead window, default 14"),
      place: z
        .string()
        .optional()
        .describe("Only events whose location mentions this place"),
      person_id: z.string().optional(),
    }),
    run(i) {
      const until = new Date(Date.now() + (i.days ?? 14) * 864e5).toISOString();
      const params: string[] = [new Date().toISOString(), until];
      let extra = "";
      if (i.place) {
        extra +=
          " AND (json_extract(i.meta, '$.location') LIKE ? OR i.subject LIKE ?)";
        params.push(`%${i.place}%`, `%${i.place}%`);
      }
      if (i.person_id) {
        extra +=
          " AND EXISTS (SELECT 1 FROM participants x WHERE x.interaction_id = i.id AND x.person_id = ?)";
        params.push(i.person_id);
      }
      return all(
        `SELECT i.id, i.kind, i.occurred_at AS starts_at, i.subject AS title, json_extract(i.meta, '$.location') AS location, i.url,
                c.name AS community,
                (SELECT GROUP_CONCAT(p.display_name || ' [' || p.id || ']') FROM participants pa JOIN people p ON p.id = pa.person_id
                 WHERE pa.interaction_id = i.id AND p.is_me = 0) AS with_people
         FROM interactions i LEFT JOIN communities c ON c.id = i.community_id
         WHERE i.kind IN ('meeting', 'event') AND i.occurred_at >= ? AND i.occurred_at <= ? ${extra}
         ORDER BY i.occurred_at LIMIT 40`,
        ...params,
      );
    },
  }),

  tool({
    name: "prep_meeting",
    description:
      "Meeting brief for a person: how you know them, last meetings and emails, shared communities, their recent community posts, notes, mutual connections, and the next scheduled meeting.",
    schema: z.object({ person: z.string().describe("Person id or name") }),
    run(i) {
      const p = resolvePerson(i.person);
      if (!p) return { error: `No one matching "${i.person}"` };
      if ("ambiguous" in p) return { ambiguous: p.ambiguous };
      const profile = personProfile(p);
      const self = me();
      const mutual = self
        ? neighbors(p.id)
            .map((n) => getPerson(n.id))
            .filter((x): x is PersonRow => !!x && !x.hidden && x.strength >= 20)
            .slice(0, 5)
            .map((x) =>
              compact(x, { evidence: pairEvidence(p.id, x.id).lines }),
            )
        : [];
      const posts = all(
        `SELECT i.occurred_at, i.subject, substr(i.snippet, 1, 400) AS snippet, c.name AS community, i.url
         FROM participants pa JOIN interactions i ON i.id = pa.interaction_id JOIN communities c ON c.id = i.community_id
         WHERE pa.person_id = ? AND i.kind = 'community_post' ORDER BY i.occurred_at DESC LIMIT 5`,
        p.id,
      );
      const next = get(
        `SELECT i.occurred_at AS starts_at, i.subject AS title, json_extract(i.meta, '$.location') AS location, i.url
         FROM participants pa JOIN interactions i ON i.id = pa.interaction_id
         WHERE pa.person_id = ? AND i.kind = 'meeting' AND i.occurred_at > datetime('now') ORDER BY i.occurred_at LIMIT 1`,
        p.id,
      );
      return {
        ...profile,
        next_meeting: next ?? null,
        recent_community_posts: posts,
        strong_mutual_connections: mutual,
      };
    },
  }),

  tool({
    name: "relationships_needing_attention",
    description:
      "Strong or once-strong relationships that are cooling or dormant, and people you meet soon — who to reconnect with.",
    schema: z.object({ limit: z.number().int().min(1).max(30).optional() }),
    run(i) {
      return all<PersonRow>(
        `SELECT * FROM people WHERE is_me = 0 AND hidden = 0 AND strength >= 30 AND trend IN ('cooling', 'dormant')
         ORDER BY strength DESC LIMIT ?`,
        i.limit ?? 10,
      ).map((p) =>
        compact(p, { how_you_know_them: myEvidence(p.id).slice(0, 3) }),
      );
    },
  }),

  tool({
    name: "overview",
    description:
      "Shape of your network: counts by source and tier, top companies, cities and communities, last sync times. Use when asked what you know.",
    schema: z.object({}),
    run() {
      return {
        people: get("SELECT COUNT(*) AS n FROM people WHERE is_me = 0")?.n,
        by_tier: all(
          `SELECT COALESCE(tier, 'No interactions') AS tier, COUNT(*) AS n FROM people WHERE is_me = 0 GROUP BY tier
           ORDER BY CASE tier WHEN 'Inner circle' THEN 1 WHEN 'Close' THEN 2 WHEN 'Active' THEN 3 WHEN 'Acquaintance' THEN 4 WHEN 'Weak tie' THEN 5 ELSE 6 END`,
        ),
        by_source: all(
          "SELECT source, COUNT(DISTINCT person_id) AS people FROM observations WHERE person_id IS NOT NULL GROUP BY source",
        ),
        interactions: all(
          "SELECT kind, COUNT(*) AS n FROM interactions GROUP BY kind",
        ),
        top_companies: all(
          "SELECT company, COUNT(*) AS n FROM people WHERE company IS NOT NULL AND is_me = 0 AND strength > 0 GROUP BY company ORDER BY n DESC LIMIT 15",
        ),
        top_cities: all(
          "SELECT city, COUNT(*) AS n FROM people WHERE city IS NOT NULL AND is_me = 0 AND strength > 0 GROUP BY city ORDER BY n DESC LIMIT 15",
        ),
        communities: all(
          "SELECT c.name, COUNT(m.person_id) AS members FROM communities c LEFT JOIN memberships m ON m.community_id = c.id GROUP BY c.id ORDER BY members DESC LIMIT 15",
        ),
        enriched: get(
          "SELECT COUNT(*) AS n FROM enrichments WHERE status = 'matched'",
        )?.n,
        accounts: all("SELECT id, provider, label, sync_state FROM accounts"),
      };
    },
  }),

  tool({
    name: "add_note",
    description:
      "Save a note about a person (context from the conversation the user wants remembered). Only call when the user asks to remember something.",
    writes: true,
    schema: z.object({
      person_id: z.string(),
      note: z.string().min(1).max(2000),
    }),
    run(i) {
      if (!getPerson(i.person_id)) return { error: "Unknown person id" };
      run(
        "INSERT INTO notes (person_id, body, source) VALUES (?, ?, 'claude')",
        i.person_id,
        i.note,
      );
      indexDocuments();
      return { saved: true };
    },
  }),

  tool({
    name: "present",
    description:
      "Show the answer visually next to your reply. Call once, at the end, with the people and evidence that matter. Kinds: " +
      "'path' (an introduction chain, person_ids in order starting with the first person after you, plus evidence per hop), " +
      "'shortlist' (ranked people with a reason each), 'brief' (one person, meeting prep), " +
      "'bridge' (two people from different parts of your network you could introduce), 'map' (people in a place, plus events).",
    schema: z.object({
      kind: z.enum(["path", "shortlist", "brief", "bridge", "map"]),
      title: z.string(),
      people: z
        .array(
          z.object({
            id: z.string(),
            reason: z
              .string()
              .describe("One line: why this person, with evidence"),
            badges: z.array(z.string()).optional(),
          }),
        )
        .describe(
          "For 'path': in hop order after you. For 'bridge': exactly the two people.",
        ),
      hops: z
        .array(
          z.object({ evidence: z.array(z.string()), confirmed: z.boolean() }),
        )
        .optional()
        .describe("For 'path': one per hop, starting with you → first person"),
      events: z
        .array(
          z.object({
            title: z.string(),
            when: z.string().optional(),
            where: z.string().optional(),
            source: z.string().optional(),
          }),
        )
        .optional(),
      draft: z
        .string()
        .optional()
        .describe("Optional intro request or message draft"),
    }),
    run(i) {
      const people = i.people
        .map((x) => {
          const p = getPerson(x.id);
          return p
            ? { ...brief(p), reason: x.reason, badges: x.badges ?? [] }
            : null;
        })
        .filter(Boolean);
      const self = me();
      return {
        shown: true,
        card: { ...i, me: self ? brief(self) : null, people },
      };
    },
  }),
];

export const toolByName = new Map(tools.map((t) => [t.name, t]));
