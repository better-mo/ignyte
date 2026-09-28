import { config } from "../config.ts";
import { all, get, run } from "../db/index.ts";
import { addIdentifiers } from "../identity/store.ts";
import { rebuildPerson } from "../identity/profile.ts";
import { providers } from "./providers.ts";
import { RateLimitError } from "./http.ts";
import type { EnrichmentResult } from "./types.ts";

const ROLE_NAME =
  /^(info|hello|hi|team|support|help|admin|sales|billing|accounts?|notes?|client ?services|customer ?(service|success|care)|noreply|no-reply|contact|office|hr|jobs|careers|press|marketing|finance|legal|security|ops|operations)$/i;
const ORG_WORD =
  /\b(team|inc\.?|llc|ltd|corp(oration)?|bank|trust|group|wires|services|support|notifications?|newsletter|digest|alerts?|hq|foundation|capital|ventures|partners|labs?|studio|agency)\b/i;

/** Names that are clearly an inbox, team or organisation rather than a person. */
export function looksLikePerson(name: string): boolean {
  const n = name.trim();
  if (!n || n.includes("@") || /\d{3,}/.test(n)) return false;
  if (ROLE_NAME.test(n.replace(/[._-]+/g, " "))) return false;
  if (ORG_WORD.test(n)) return false;
  // One-word names are allowed only when they look like a real first name ("Sara"), not "ClientServices".
  if (!/\s/.test(n) && /[a-z][A-Z]/.test(n)) return false;
  return true;
}

export type EnrichOptions = {
  limit?: number;
  minStrength?: number;
  provider?: string;
  personIds?: string[];
  force?: boolean;
};

/**
 * Enrich the strongest relationships first, each at most once per refresh window,
 * so spend stays proportional to how many people actually matter to you.
 */
export async function enrichPeople(
  opts: EnrichOptions = {},
  log = console.log,
) {
  const provider = providers[opts.provider ?? config.enrichment.provider];
  if (!provider)
    throw new Error(`Unknown enrichment provider ${opts.provider}`);
  const limit = opts.limit ?? 25;
  const cutoff = new Date(
    Date.now() - config.enrichment.refreshDays * 864e5,
  ).toISOString();

  const candidates = opts.personIds?.length
    ? all<{ id: string; display_name: string; company: string | null }>(
        `SELECT id, display_name, company FROM people WHERE id IN (${opts.personIds.map(() => "?").join(",")})`,
        ...opts.personIds,
      )
    : all<{ id: string; display_name: string; company: string | null }>(
        `SELECT p.id, p.display_name, p.company FROM people p
         WHERE p.is_me = 0 AND p.hidden = 0 AND p.strength >= ?
           AND (? OR NOT EXISTS (SELECT 1 FROM enrichments e WHERE e.person_id = p.id AND e.provider = ? AND e.fetched_at > ?))
         ORDER BY p.strength DESC LIMIT ?`,
        opts.minStrength ?? 10,
        opts.force ? 1 : 0,
        provider.name,
        cutoff,
        limit,
      );

  const tally = { matched: 0, no_match: 0, error: 0, skipped: 0 };
  for (const c of candidates) {
    if (!opts.personIds?.length && !looksLikePerson(c.display_name)) {
      tally.skipped++;
      continue;
    }
    const ids = all<{ kind: string; value: string }>(
      "SELECT kind, value FROM identifiers WHERE person_id = ?",
      c.id,
    );
    const query = {
      name:
        c.display_name.startsWith("@") || c.display_name.includes("@")
          ? ""
          : c.display_name,
      emails: ids.filter((i) => i.kind === "email").map((i) => i.value),
      phones: ids.filter((i) => i.kind === "phone").map((i) => i.value),
      linkedinUrl: ids.find((i) => i.kind === "linkedin")
        ? `https://www.linkedin.com/in/${ids.find((i) => i.kind === "linkedin")!.value}`
        : undefined,
      company: c.company ?? undefined,
    };
    let result: EnrichmentResult;
    try {
      result = await provider.enrich(query);
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
      log(`  ${err.message}. Stopping; re-run later to continue where this left off.`);
      break;
    }
    tally[result.status]++;
    if (result.status === "error") {
      log(`  enrich ${c.display_name}: ${result.error}`);
      if (/401|403|402|not set/.test(result.error)) break;
      continue;
    }
    run(
      `INSERT INTO enrichments (person_id, provider, status, fetched_at, data, raw) VALUES (?, ?, ?, datetime('now'), ?, ?)
       ON CONFLICT(person_id, provider) DO UPDATE SET status = excluded.status, fetched_at = excluded.fetched_at, data = excluded.data, raw = excluded.raw`,
      c.id,
      provider.name,
      result.status,
      result.status === "matched" ? JSON.stringify(result.profile) : null,
      JSON.stringify(result.raw ?? null),
    );
    let personId = c.id;
    if (result.status === "matched") {
      // New identifiers can reveal that two records are one human (e.g. LinkedIn-only + Gmail).
      personId = addIdentifiers(
        c.id,
        {
          linkedinUrl: result.profile.linkedinUrl,
          xHandle: result.profile.xHandle,
          emails: result.profile.emails,
        },
        `enrichment:${provider.name}`,
      );
      rebuildPerson(personId);
    }
    const p = get<{ headline: string | null }>(
      "SELECT headline FROM people WHERE id = ?",
      personId,
    );
    log(
      `  enrich ${c.display_name}: ${result.status}${p?.headline ? ` — ${p.headline}` : ""}`,
    );
  }
  log(
    `  enrichment via ${provider.name}: ${tally.matched} matched, ${tally.no_match} no match, ${tally.error} errors, ${tally.skipped} skipped (not a person)`,
  );
  return tally;
}
