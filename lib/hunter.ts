// Hunter.io API integration
// Free plan: 50 credits/month, API access included
// Discover endpoint: FREE (0 credits) - find companies by criteria
// Domain Search: 1 credit - get ALL emails at a company domain
// Email Finder: 1 credit - find specific person's email
// Email Verifier: 1 credit - verify an email

const HUNTER_BASE = "https://api.hunter.io/v2";

export interface HunterCompany {
  domain: string;
  name: string;
  industry: string | null;
  headcount: string | null;
  country: string | null;
  linkedin_url: string | null;
}

export interface HunterEmail {
  value: string;
  type: string | null;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  linkedin_url: string | null;
  twitter: string | null;
  sources: { uri: string; extracted_on: string }[];
}

export interface HunterDomainResult {
  domain: string;
  organization: string;
  pattern: string | null;
  emails: HunterEmail[];
  remainingCredits: number;
}

export interface HunterDiscoverResult {
  companies: HunterCompany[];
  total: number;
  remainingCredits: number;
}

/**
 * Discover companies matching criteria — FREE (0 credits)
 */
export async function discoverCompanies(
  apiKey: string,
  params: {
    query?: string;
    industry?: string;
    headcount?: string;
    country?: string;
    limit?: number;
    offset?: number;
  }
): Promise<HunterDiscoverResult> {
  const url = new URL(`${HUNTER_BASE}/discover`);
  url.searchParams.set("api_key", apiKey);

  if (params.query) url.searchParams.set("query", params.query);
  if (params.industry) url.searchParams.set("industry", params.industry);
  if (params.headcount) url.searchParams.set("headcount", params.headcount);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    const err = data.errors?.[0]?.details || `Hunter API error (${res.status})`;
    throw new Error(err);
  }

  const companies: HunterCompany[] = (data.data?.companies || []).map((c: any) => ({
    domain: c.domain,
    name: c.name,
    industry: c.industry || null,
    headcount: c.headcount || null,
    country: c.country || null,
    linkedin_url: c.linkedin_url || null,
  }));

  return {
    companies,
    total: data.meta?.total || companies.length,
    remainingCredits: data.meta?.remaining_credits || 0,
  };
}

/**
 * Domain Search — get ALL emails at a company domain
 * Costs 1 credit, returns multiple emails (great value!)
 */
export async function domainSearch(
  apiKey: string,
  domain: string,
  params?: { limit?: number; seniority?: string; department?: string }
): Promise<HunterDomainResult> {
  const url = new URL(`${HUNTER_BASE}/domain-search`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("domain", domain);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.seniority) url.searchParams.set("seniority", params.seniority);
  if (params?.department) url.searchParams.set("department", params.department);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    const err = data.errors?.[0]?.details || `Hunter API error (${res.status})`;
    throw new Error(err);
  }

  const emails: HunterEmail[] = (data.data?.emails || []).map((e: any) => ({
    value: e.value,
    type: e.type || null,
    confidence: e.confidence || 0,
    first_name: e.first_name || null,
    last_name: e.last_name || null,
    position: e.position || null,
    seniority: e.seniority || null,
    department: e.department || null,
    linkedin_url: e.linkedin || null,
    twitter: e.twitter || null,
    sources: e.sources || [],
  }));

  return {
    domain: data.data?.domain || domain,
    organization: data.data?.organization || "",
    pattern: data.data?.pattern || null,
    emails,
    remainingCredits: data.meta?.remaining_credits || 0,
  };
}

/**
 * Email Finder — find a specific person's email by name + domain
 * Costs 1 credit
 */
export async function findEmail(
  apiKey: string,
  params: { firstName?: string; lastName?: string; domain?: string; fullName?: string }
): Promise<{
  email: string | null;
  confidence: number;
  remainingCredits: number;
}> {
  const url = new URL(`${HUNTER_BASE}/email-finder`);
  url.searchParams.set("api_key", apiKey);

  if (params.domain) url.searchParams.set("domain", params.domain);
  if (params.fullName) {
    const parts = params.fullName.split(" ");
    url.searchParams.set("first_name", parts[0] || "");
    url.searchParams.set("last_name", parts.slice(1).join(" ") || "");
  } else {
    if (params.firstName) url.searchParams.set("first_name", params.firstName);
    if (params.lastName) url.searchParams.set("last_name", params.lastName);
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    const err = data.errors?.[0]?.details || `Hunter API error (${res.status})`;
    throw new Error(err);
  }

  return {
    email: data.data?.email || null,
    confidence: data.data?.confidence || 0,
    remainingCredits: data.meta?.remaining_credits || 0,
  };
}

/**
 * Email Verifier — check if an email is deliverable
 * Costs 1 credit
 */
export async function verifyEmail(
  apiKey: string,
  email: string
): Promise<{
  status: string;
  result: string;
  remainingCredits: number;
}> {
  const url = new URL(`${HUNTER_BASE}/email-verifier`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    const err = data.errors?.[0]?.details || `Hunter API error (${res.status})`;
    throw new Error(err);
  }

  return {
    status: data.data?.status || "unknown",
    result: data.data?.result || "undeliverable",
    remainingCredits: data.meta?.remaining_credits || 0,
  };
}
