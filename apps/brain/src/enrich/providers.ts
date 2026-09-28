import { config } from "../config.ts";
import { linkedinSlug, xHandle } from "../identity/normalize.ts";
import { pacedFetch } from "./http.ts";
import type {
  EnrichedProfile,
  EnrichmentProvider,
  EnrichmentQuery,
  EnrichmentResult,
} from "./types.ts";

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !(Array.isArray(v) && !v.length),
    ),
  ) as T;

const withHttps = (u?: string | null) =>
  u ? (u.startsWith("http") ? u : `https://${u}`) : undefined;

/**
 * People Data Labs person enrichment. Billed only on a match; the free tier covers
 * a small monthly allowance, which is enough to enrich your closest ties.
 * https://docs.peopledatalabs.com/docs/person-enrichment-api
 */
export const pdl: EnrichmentProvider = {
  name: "pdl",
  async enrich(q: EnrichmentQuery): Promise<EnrichmentResult> {
    if (!config.enrichment.pdlKey)
      return { status: "error", error: "PDL_API_KEY not set" };
    const params = new URLSearchParams({
      min_likelihood: "6",
      titlecase: "true",
    });
    const slug = linkedinSlug(q.linkedinUrl);
    if (slug) params.set("profile", `linkedin.com/in/${slug}`);
    for (const e of q.emails.slice(0, 3)) params.append("email", e);
    if (q.phones[0]) params.set("phone", q.phones[0]);
    if (q.name) params.set("name", q.name);
    if (q.company) params.set("company", q.company);
    if (!slug && !q.emails.length && !q.phones.length && !q.company)
      return { status: "no_match" };

    const res = await pacedFetch(
      "pdl",
      `https://api.peopledatalabs.com/v5/person/enrich?${params}`,
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
    const body = (await res.json()) as { data?: any };
    const d = body.data;
    if (!d) return { status: "no_match", raw: body };
    return { status: "matched", raw: body, profile: mapPdl(d) };
  },
};

// PDL returns `true` for fields your plan hasn't unlocked; only real values count.
export const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;
export const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function mapPdl(d: any): EnrichedProfile {
  return clean({
    fullName: str(d.full_name),
    headline: str(d.headline),
    title: str(d.job_title),
    company: str(d.job_company_name),
    companyDomain: str(d.job_company_website),
    city: str(d.location_locality),
    region: str(d.location_region),
    country: str(d.location_country),
    linkedinUrl: withHttps(str(d.linkedin_url)),
    xHandle: xHandle(str(d.twitter_url)) ?? undefined,
    githubUrl: withHttps(str(d.github_url)),
    summary: str(d.summary),
    skills: arr(d.skills)
      .filter((x) => typeof x === "string")
      .slice(0, 25),
    interests: arr(d.interests)
      .filter((x) => typeof x === "string")
      .slice(0, 15),
    emails: [
      ...arr(d.emails).map((e: any) =>
        typeof e === "string" ? e : e?.address,
      ),
      d.work_email,
      ...arr(d.personal_emails),
    ].filter((e: unknown): e is string => typeof e === "string"),
    positions: arr(d.experience)
      .filter((x: any) => str(x?.company?.name))
      .map((x: any) =>
        clean({
          company: x.company.name,
          domain: str(x.company.website),
          title: str(x.title?.name),
          start: str(x.start_date),
          end: str(x.end_date),
          current: !str(x.end_date) && x.is_primary === true,
        }),
      ),
    schools: arr(d.education)
      .filter((x: any) => str(x?.school?.name))
      .map((x: any) =>
        clean({
          school: x.school.name,
          degree:
            [...arr(x.degrees), ...arr(x.majors)]
              .filter((v) => typeof v === "string")
              .join(", ") || undefined,
          start: str(x.start_date),
          end: str(x.end_date),
        }),
      ),
  });
}

/**
 * Apollo people match. Uses credits from your Apollo plan (free plan includes some).
 * https://docs.apollo.io/reference/people-enrichment
 */
export const apollo: EnrichmentProvider = {
  name: "apollo",
  async enrich(q: EnrichmentQuery): Promise<EnrichmentResult> {
    if (!config.enrichment.apolloKey)
      return { status: "error", error: "APOLLO_API_KEY not set" };
    const [first, ...rest] = q.name.split(" ");
    const body = clean({
      email: q.emails[0],
      linkedin_url: q.linkedinUrl,
      first_name: first,
      last_name: rest.join(" ") || undefined,
      organization_name: q.company,
      reveal_personal_emails: false,
    });
    const res = await pacedFetch("apollo", "https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.enrichment.apolloKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      return {
        status: "error",
        error: `Apollo ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    const raw = (await res.json()) as { person?: any };
    const p = raw.person;
    if (!p) return { status: "no_match", raw };
    return {
      status: "matched",
      raw,
      profile: clean({
        fullName: str(p.name),
        headline: str(p.headline),
        title: str(p.title),
        company: str(p.organization?.name),
        companyDomain: str(p.organization?.primary_domain),
        city: str(p.city),
        region: str(p.state),
        country: str(p.country),
        linkedinUrl: str(p.linkedin_url),
        xHandle: xHandle(str(p.twitter_url)) ?? undefined,
        githubUrl: str(p.github_url),
        photoUrl: str(p.photo_url),
        positions: arr(p.employment_history)
          .filter((x: any) => str(x?.organization_name))
          .map((x: any) =>
            clean({
              company: x.organization_name,
              title: str(x.title),
              start: str(x.start_date)?.slice(0, 7),
              end: str(x.end_date)?.slice(0, 7),
              current: !!x.current,
            }),
          ),
      }),
    };
  },
};

export const providers: Record<string, EnrichmentProvider> = { pdl, apollo };
