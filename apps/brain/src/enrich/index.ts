import { config } from "../config.ts";
import { all, get, run } from "../db/index.ts";
import { addIdentifiers } from "../identity/store.ts";
import { rebuildPerson } from "../identity/profile.ts";
import { providers } from "./providers.ts";

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

  const tally = { matched: 0, no_match: 0, error: 0 };
  for (const c of candidates) {
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
    const result = await provider.enrich(query);
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
    `  enrichment via ${provider.name}: ${tally.matched} matched, ${tally.no_match} no match, ${tally.error} errors`,
  );
  return tally;
}
