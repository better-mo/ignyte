import { config } from "../config.ts";
import { all, get, run } from "../db/index.ts";
import { normalizeDomain, type CompanyRow } from "./index.ts";

export type CompanyProfile = {
  name?: string;
  domain?: string;
  linkedinUrl?: string;
  industry?: string;
  size?: string;
  employeeCount?: number;
  city?: string;
  region?: string;
  country?: string;
  founded?: number;
  fundingStage?: string;
  description?: string;
  tags?: string[];
};

export type CompanyEnrichResult =
  | { status: "matched"; profile: CompanyProfile }
  | { status: "no_match" }
  | { status: "error"; error: string };

type Provider = (c: CompanyRow) => Promise<CompanyEnrichResult>;

export function mapPdlCompany(d: any): CompanyProfile {
  return {
    name: d.display_name ?? d.name,
    domain: normalizeDomain(d.website) ?? undefined,
    linkedinUrl: d.linkedin_url
      ? `https://${String(d.linkedin_url).replace(/^https?:\/\//, "")}`
      : undefined,
    industry: d.industry ?? undefined,
    size: d.size ?? undefined,
    employeeCount: d.employee_count ?? undefined,
    city: d.location?.locality ?? undefined,
    region: d.location?.region ?? undefined,
    country: d.location?.country ?? undefined,
    founded: d.founded ?? undefined,
    fundingStage: d.latest_funding_stage ?? undefined,
    description: d.summary ? String(d.summary).slice(0, 800) : undefined,
    tags: Array.isArray(d.tags) ? d.tags.slice(0, 15) : undefined,
  };
}

/** People Data Labs company enrichment (billed per match). */
const pdl: Provider = async (c) => {
  if (!config.enrichment.pdlKey)
    return { status: "error", error: "PDL_API_KEY not set" };
  const params = new URLSearchParams({
    ...(c.domain ? { website: c.domain } : { name: c.name }),
    titlecase: "true",
  });
  const res = await fetch(
    `https://api.peopledatalabs.com/v5/company/enrich?${params}`,
    {
      headers: { "X-Api-Key": config.enrichment.pdlKey },
    },
  );
  if (res.status === 404) return { status: "no_match" };
  if (!res.ok)
    return {
      status: "error",
      error: `PDL ${res.status}: ${(await res.text()).slice(0, 300)}`,
    };
  return { status: "matched", profile: mapPdlCompany(await res.json()) };
};

/** Apollo organization enrichment (needs a domain). */
const apollo: Provider = async (c) => {
  if (!config.enrichment.apolloKey)
    return { status: "error", error: "APOLLO_API_KEY not set" };
  if (!c.domain) return { status: "no_match" };
  const res = await fetch(
    `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(c.domain)}`,
    {
      headers: { "x-api-key": config.enrichment.apolloKey },
    },
  );
  if (!res.ok)
    return {
      status: "error",
      error: `Apollo ${res.status}: ${(await res.text()).slice(0, 300)}`,
    };
  const o = ((await res.json()) as { organization?: any }).organization;
  if (!o) return { status: "no_match" };
  return {
    status: "matched",
    profile: {
      name: o.name,
      domain: normalizeDomain(o.website_url ?? o.primary_domain) ?? undefined,
      linkedinUrl: o.linkedin_url ?? undefined,
      industry: o.industry ?? undefined,
      employeeCount: o.estimated_num_employees ?? undefined,
      city: o.city ?? undefined,
      region: o.state ?? undefined,
      country: o.country ?? undefined,
      founded: o.founded_year ?? undefined,
      fundingStage: o.latest_funding_stage ?? undefined,
      description: o.short_description ?? undefined,
      tags: o.keywords?.slice(0, 15),
    },
  };
};

export const companyProviders: Record<string, Provider> = { pdl, apollo };

function save(companyId: string, r: CompanyEnrichResult) {
  if (r.status === "error") return;
  if (r.status === "no_match") {
    run(
      "UPDATE companies SET enrich_status = 'no_match', enriched_at = datetime('now') WHERE id = ?",
      companyId,
    );
    return;
  }
  const p = r.profile;
  run(
    `UPDATE companies SET name = COALESCE(?, name), domain = COALESCE(domain, ?), linkedin_url = ?, industry = ?, size = ?,
       employee_count = ?, city = ?, region = ?, country = ?, founded = ?, funding_stage = ?, description = ?, tags = ?,
       enrich_status = 'matched', enriched_at = datetime('now')
     WHERE id = ?`,
    p.name ?? null,
    p.domain ?? null,
    p.linkedinUrl ?? null,
    p.industry ?? null,
    p.size ?? null,
    p.employeeCount ?? null,
    p.city ?? null,
    p.region ?? null,
    p.country ?? null,
    p.founded ?? null,
    p.fundingStage ?? null,
    p.description ?? null,
    p.tags ? JSON.stringify(p.tags) : null,
    companyId,
  );
  if (p.domain) {
    run(
      "INSERT OR IGNORE INTO company_aliases (kind, value, company_id, source) VALUES ('domain', ?, ?, 'enrichment')",
      p.domain,
      companyId,
    );
  }
}

/**
 * Enrich the companies where you have the warmest access first (by your strongest
 * current contact there), each once per refresh window.
 */
export async function enrichCompanies(
  opts: {
    limit?: number;
    companyIds?: string[];
    provider?: string;
    force?: boolean;
  } = {},
  log = console.log,
) {
  const provider =
    companyProviders[opts.provider ?? config.enrichment.provider];
  if (!provider)
    throw new Error(`Unknown enrichment provider ${opts.provider}`);
  const cutoff = new Date(Date.now() - config.enrichment.refreshDays * 864e5)
    .toISOString()
    .replace("T", " ");
  const targets = opts.companyIds?.length
    ? all<CompanyRow>(
        `SELECT * FROM companies WHERE id IN (${opts.companyIds.map(() => "?").join(",")})`,
        ...opts.companyIds,
      )
    : all<CompanyRow>(
        `SELECT c.* FROM companies c
         JOIN employment e ON e.company_id = c.id JOIN people p ON p.id = e.person_id
         WHERE p.is_me = 0 AND p.hidden = 0 AND (? OR c.enriched_at IS NULL OR c.enriched_at < ?)
         GROUP BY c.id ORDER BY MAX(CASE WHEN e.is_current = 1 THEN p.strength ELSE p.strength / 2 END) DESC, COUNT(*) DESC
         LIMIT ?`,
        opts.force ? 1 : 0,
        cutoff,
        opts.limit ?? 25,
      );
  const tally = { matched: 0, no_match: 0, error: 0 };
  for (const c of targets) {
    const r = await provider(c);
    tally[r.status]++;
    if (r.status === "error") {
      log(`  company ${c.name}: ${r.error}`);
      if (/401|402|403|not set/.test(r.error)) break;
      continue;
    }
    save(c.id, r);
    const after = get<CompanyRow>("SELECT * FROM companies WHERE id = ?", c.id);
    log(
      `  company ${c.name}: ${r.status}${after?.industry ? ` — ${after.industry}` : ""}${after?.size ? `, ${after.size}` : ""}`,
    );
  }
  log(
    `  company enrichment: ${tally.matched} matched, ${tally.no_match} no match, ${tally.error} errors`,
  );
  return tally;
}
