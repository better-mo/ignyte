import { all, get, run, tx } from "../db/index.ts";
import {
  companyKey,
  domainOf,
  hash,
  isFreeMail,
} from "../identity/normalize.ts";

export type CompanyRow = {
  id: string;
  name: string;
  key: string;
  domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  size: string | null;
  employee_count: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  founded: number | null;
  funding_stage: string | null;
  description: string | null;
  tags: string | null;
  enrich_status: string | null;
  enriched_at: string | null;
};

// Renames and parent names people use interchangeably. Extend with `brain company-alias`.
const SEED_ALIASES: Record<string, string> = {
  facebook: "meta",
  "meta platforms": "meta",
  alphabet: "google",
};

/** "https://www.Shopify.com/about" -> "shopify.com" */
export function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/** The registrable label of a domain: "mail.shopify.co.uk" -> "shopify". */
function domainLabel(domain: string): string {
  const parts = domain.split(".");
  const tld2 = parts.length > 2 && parts[parts.length - 2].length <= 3;
  return parts[parts.length - (tld2 ? 3 : 2)] ?? parts[0];
}

export const canonicalKey = (name?: string | null) => {
  const key = companyKey(name);
  return SEED_ALIASES[key] ?? key;
};

const aliasOf = (kind: "key" | "domain", value: string) =>
  get<{ company_id: string }>(
    "SELECT company_id FROM company_aliases WHERE kind = ? AND value = ?",
    kind,
    value,
  )?.company_id;

const addAlias = (
  kind: "key" | "domain",
  value: string,
  companyId: string,
  source: string,
) =>
  run(
    "INSERT OR IGNORE INTO company_aliases (kind, value, company_id, source) VALUES (?, ?, ?, ?)",
    kind,
    value,
    companyId,
    source,
  );

/**
 * Company id for one job: domain alias first (most reliable), then name alias,
 * else a new company. A second company with the same name but a different domain
 * stays separate; name-only jobs go to the first one seen.
 */
export function resolveCompany(
  name: string,
  domainRaw?: string | null,
  source = "job",
): string | null {
  const key = canonicalKey(name);
  if (!key) return null;
  const domain = normalizeDomain(domainRaw);
  const byDomain = domain ? aliasOf("domain", domain) : undefined;
  if (byDomain) {
    addAlias("key", key, byDomain, source);
    return byDomain;
  }
  const byKey = aliasOf("key", key);
  if (byKey) {
    if (domain) {
      const existing = get<{ domain: string | null }>(
        "SELECT domain FROM companies WHERE id = ?",
        byKey,
      );
      if (existing?.domain && existing.domain !== domain) {
        return createCompany(name, key, domain, `${key}|${domain}`, source);
      }
      run(
        "UPDATE companies SET domain = COALESCE(domain, ?) WHERE id = ?",
        domain,
        byKey,
      );
      addAlias("domain", domain, byKey, source);
    }
    return byKey;
  }
  return createCompany(name, key, domain, key, source);
}

function createCompany(
  name: string,
  key: string,
  domain: string | null,
  idSeed: string,
  source: string,
) {
  const id = `co_${hash(idSeed)}`;
  run(
    "INSERT OR IGNORE INTO companies (id, name, key, domain) VALUES (?, ?, ?, ?)",
    id,
    name.trim(),
    key,
    domain,
  );
  addAlias("key", key, id, source);
  if (domain) addAlias("domain", domain, id, source);
  return id;
}

/** Fold company `fromId` into `intoId`. */
export function mergeCompanies(fromId: string, intoId: string) {
  if (fromId === intoId) return;
  tx(() => {
    run(
      "UPDATE employment SET company_id = ? WHERE company_id = ?",
      intoId,
      fromId,
    );
    run(
      "UPDATE OR IGNORE company_aliases SET company_id = ? WHERE company_id = ?",
      intoId,
      fromId,
    );
    run("DELETE FROM company_aliases WHERE company_id = ?", fromId);
    const from = get<CompanyRow>(
      "SELECT * FROM companies WHERE id = ?",
      fromId,
    );
    if (from?.domain)
      run(
        "UPDATE companies SET domain = COALESCE(domain, ?) WHERE id = ?",
        from.domain,
        intoId,
      );
    run("DELETE FROM companies WHERE id = ?", fromId);
  });
}

/**
 * Whole-network pass after a rebuild: link any unlinked jobs, learn company domains
 * from people's work emails, name each company by its most common spelling, and drop
 * companies nobody works at.
 */
export function resolveCompanies() {
  tx(() => {
    const unlinked = all<{
      id: number;
      company: string;
      company_domain: string | null;
    }>(
      "SELECT id, company, company_domain FROM employment WHERE company_id IS NULL ORDER BY company_domain IS NULL",
    );
    for (const e of unlinked) {
      run(
        "UPDATE employment SET company_id = ? WHERE id = ?",
        resolveCompany(e.company, e.company_domain),
        e.id,
      );
    }

    // sara@shopify.com + a current job at "Shopify" teaches us shopify.com is Shopify.
    const pairs = all<{ value: string; company_id: string; key: string }>(
      `SELECT DISTINCT i.value, e.company_id, c.key FROM identifiers i
       JOIN employment e ON e.person_id = i.person_id AND e.is_current = 1
       JOIN companies c ON c.id = e.company_id
       WHERE i.kind = 'email'`,
    );
    for (const p of pairs) {
      if (isFreeMail(p.value)) continue;
      const domain = domainOf(p.value);
      const label = domainLabel(domain);
      const compact = p.key.replace(/\s/g, "");
      if (
        label.length < 3 ||
        !(
          compact === label ||
          compact.startsWith(label) ||
          label.startsWith(compact)
        )
      )
        continue;
      const owner = aliasOf("domain", domain);
      if (!owner) {
        addAlias("domain", domain, p.company_id, "work email");
        run(
          "UPDATE companies SET domain = COALESCE(domain, ?) WHERE id = ?",
          domain,
          p.company_id,
        );
      } else if (owner !== p.company_id) {
        // Same domain and matching name → same company recorded twice.
        const ownerKey = get<{ key: string }>(
          "SELECT key FROM companies WHERE id = ?",
          owner,
        )?.key;
        if (ownerKey === p.key) mergeCompanies(p.company_id, owner);
      }
    }

    const names = all<{ company_id: string; company: string; n: number }>(
      `SELECT company_id, company, COUNT(*) AS n FROM employment WHERE company_id IS NOT NULL
       GROUP BY company_id, company ORDER BY company_id, n DESC`,
    );
    let last = "";
    for (const r of names) {
      if (r.company_id === last) continue;
      last = r.company_id;
      run(
        "UPDATE companies SET name = ? WHERE id = ? AND enrich_status IS NOT 'matched'",
        r.company,
        r.company_id,
      );
    }

    run(
      `DELETE FROM companies WHERE enrich_status IS NULL
         AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.company_id = companies.id)`,
    );
    run(
      "DELETE FROM company_aliases WHERE company_id NOT IN (SELECT id FROM companies)",
    );
  });
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM companies")?.n ?? 0;
}

/** Find a company from free text: a domain, a known name or alias, or a name prefix. */
export function findCompany(text: string): CompanyRow | undefined {
  const byId = get<CompanyRow>("SELECT * FROM companies WHERE id = ?", text);
  if (byId) return byId;
  const domain = text.includes(".") ? normalizeDomain(text) : null;
  const key = canonicalKey(text);
  const id =
    (domain && aliasOf("domain", domain)) ||
    (key && aliasOf("key", key)) ||
    (key &&
      get<{ company_id: string }>(
        `SELECT a.company_id FROM company_aliases a
         LEFT JOIN employment e ON e.company_id = a.company_id
         WHERE a.kind = 'key' AND a.value LIKE ?
         GROUP BY a.company_id ORDER BY COUNT(e.id) DESC LIMIT 1`,
        `${key}%`,
      )?.company_id);
  return id
    ? get<CompanyRow>("SELECT * FROM companies WHERE id = ?", id)
    : undefined;
}

export const companyDomains = (companyId: string) =>
  all<{ value: string }>(
    "SELECT value FROM company_aliases WHERE company_id = ? AND kind = 'domain'",
    companyId,
  ).map((r) => r.value);

/** Record that `alias` (a name or domain) means `target`, merging if both already exist. */
export function aliasCompany(alias: string, target: string): CompanyRow {
  const to = findCompany(target);
  if (!to) throw new Error(`No company matching "${target}"`);
  const domain = alias.includes(".") ? normalizeDomain(alias) : null;
  const existing = domain
    ? aliasOf("domain", domain)
    : aliasOf("key", canonicalKey(alias));
  if (existing && existing !== to.id) mergeCompanies(existing, to.id);
  if (domain) addAlias("domain", domain, to.id, "manual");
  else addAlias("key", canonicalKey(alias), to.id, "manual");
  return get<CompanyRow>("SELECT * FROM companies WHERE id = ?", to.id)!;
}
