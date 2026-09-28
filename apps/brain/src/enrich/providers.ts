import { config } from "../config.ts";
import { linkedinSlug, xHandle } from "../identity/normalize.ts";
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

    const res = await fetch(
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

export function mapPdl(d: any): EnrichedProfile {
  return clean({
    fullName: d.full_name,
    headline: d.headline ?? undefined,
    title: d.job_title,
    company: d.job_company_name,
    companyDomain: d.job_company_website,
    city: d.location_locality,
    region: d.location_region,
    country: d.location_country,
    linkedinUrl: withHttps(d.linkedin_url),
    xHandle: xHandle(d.twitter_url) ?? undefined,
    githubUrl: withHttps(d.github_url),
    summary: d.summary,
    skills: (d.skills ?? []).slice(0, 25),
    interests: (d.interests ?? []).slice(0, 15),
    emails: [
      ...(Array.isArray(d.emails)
        ? d.emails.map((e: any) => (typeof e === "string" ? e : e.address))
        : []),
      ...(typeof d.work_email === "string" ? [d.work_email] : []),
      ...(Array.isArray(d.personal_emails) ? d.personal_emails : []),
    ].filter((e: unknown): e is string => typeof e === "string"),
    positions: (d.experience ?? [])
      .filter((x: any) => x.company?.name)
      .map((x: any) =>
        clean({
          company: x.company.name,
          domain: x.company.website ?? undefined,
          title: x.title?.name ?? undefined,
          start: x.start_date ?? undefined,
          end: x.end_date ?? undefined,
          current: !x.end_date && !!x.is_primary,
        }),
      ),
    schools: (d.education ?? [])
      .filter((x: any) => x.school?.name)
      .map((x: any) =>
        clean({
          school: x.school.name,
          degree:
            [...(x.degrees ?? []), ...(x.majors ?? [])].join(", ") || undefined,
          start: x.start_date ?? undefined,
          end: x.end_date ?? undefined,
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
    const res = await fetch("https://api.apollo.io/api/v1/people/match", {
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
        fullName: p.name,
        headline: p.headline,
        title: p.title,
        company: p.organization?.name,
        companyDomain: p.organization?.primary_domain,
        city: p.city,
        region: p.state,
        country: p.country,
        linkedinUrl: p.linkedin_url,
        xHandle: xHandle(p.twitter_url) ?? undefined,
        githubUrl: p.github_url,
        photoUrl: p.photo_url,
        positions: (p.employment_history ?? [])
          .filter((x: any) => x.organization_name)
          .map((x: any) =>
            clean({
              company: x.organization_name,
              title: x.title,
              start: x.start_date?.slice(0, 7),
              end: x.end_date?.slice(0, 7),
              current: !!x.current,
            }),
          ),
      }),
    };
  },
};

export const providers: Record<string, EnrichmentProvider> = { pdl, apollo };
