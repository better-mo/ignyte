import type { Position, School } from "../model.ts";

/** Provider-neutral enrichment result. */
export type EnrichedProfile = {
  fullName?: string;
  headline?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  city?: string;
  region?: string;
  country?: string;
  linkedinUrl?: string;
  xHandle?: string;
  githubUrl?: string;
  photoUrl?: string;
  summary?: string;
  skills?: string[];
  interests?: string[];
  emails?: string[];
  positions?: Position[];
  schools?: School[];
};

export type EnrichmentQuery = {
  name: string;
  emails: string[];
  phones: string[];
  linkedinUrl?: string;
  company?: string;
};

export type EnrichmentResult =
  | { status: "matched"; profile: EnrichedProfile; raw: unknown }
  | { status: "no_match"; raw?: unknown }
  | { status: "error"; error: string };

export interface EnrichmentProvider {
  name: string;
  enrich(q: EnrichmentQuery): Promise<EnrichmentResult>;
}
