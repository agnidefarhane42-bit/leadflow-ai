// Apollo.io API integration
// Free plan: People API Search (0 credits), People Enrichment (1 credit/email reveal)
// Free tier: 100 credits/month

const APOLLO_BASE = "https://api.apollo.io/api/v1";

export interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  title: string | null;
  organization_name: string | null;
  organization_domain: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  seniority: string | null;
  departments: string[];
  email_status: string | null;
}

export interface ApolloSearchResult {
  people: ApolloPerson[];
  total: number;
  remainingCredits: number;
}

/**
 * Search for people in Apollo's database using criteria.
 * 0 credits — returns real people with names, titles, companies, LinkedIn URLs.
 * Does NOT return emails — use enrichPerson() for that.
 */
export async function searchPeople(
  apiKey: string,
  params: {
    titles?: string[];
    keywords?: string;
    personLocations?: string[];
    organizationLocations?: string[];
    organizationDomains?: string[];
    companySizeRanges?: string[];
    perPage?: number;
    page?: number;
  }
): Promise<ApolloSearchResult> {
  const body: any = {
    api_key: apiKey,
    per_page: params.perPage || 10,
    page: params.page || 1,
    "contact_email_status[]": ["verified"],
  };

  if (params.titles && params.titles.length > 0) {
    body["person_titles[]"] = params.titles;
  }
  if (params.keywords) {
    body.q_keywords = params.keywords;
  }
  if (params.personLocations && params.personLocations.length > 0) {
    body["person_locations[]"] = params.personLocations;
  }
  if (params.organizationLocations && params.organizationLocations.length > 0) {
    body["organization_locations[]"] = params.organizationLocations;
  }
  if (params.organizationDomains && params.organizationDomains.length > 0) {
    body["q_organization_domains_list[]"] = params.organizationDomains;
  }
  if (params.companySizeRanges && params.companySizeRanges.length > 0) {
    body["organization_num_employees_ranges[]"] = params.companySizeRanges;
  }

  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apollo search failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  const people: ApolloPerson[] = (data.people || []).map((p: any) => ({
    id: p.id,
    first_name: p.first_name || "",
    last_name: p.last_name || "",
    full_name: p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
    email: null, // Apollo search doesn't return emails
    title: p.title || null,
    organization_name: p.organization?.name || p.organization_name || null,
    organization_domain: p.organization?.website_url || p.organization?.primary_domain?.domain || null,
    linkedin_url: p.linkedin_url || null,
    photo_url: p.photo_url || null,
    city: p.city || null,
    country: p.country || null,
    seniority: p.seniority || null,
    departments: p.departments || [],
    email_status: p.email_status || null,
  }));

  return {
    people,
    total: data.total || people.length,
    remainingCredits: data.remaining_credits || 0,
  };
}

/**
 * Enrich a person's data to reveal their real email address.
 * Costs 1-9 credits per person (1 for email only, 9 if phone also returned).
 * Use sparingly — only for qualified prospects.
 */
export async function enrichPerson(
  apiKey: string,
  params: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    organizationName?: string;
    domain?: string;
    linkedinUrl?: string;
  }
): Promise<{
  email: string | null;
  emailStatus: string | null;
  person: ApolloPerson | null;
  remainingCredits: number;
}> {
  const body: any = {
    api_key: apiKey,
    reveal_personal_emails: false,
  };

  if (params.name) body.name = params.name;
  if (params.firstName) body.first_name = params.firstName;
  if (params.lastName) body.last_name = params.lastName;
  if (params.email) body.email = params.email;
  if (params.organizationName) body.organization_name = params.organizationName;
  if (params.domain) body.domain = params.domain;
  if (params.linkedinUrl) body.linkedin_url = params.linkedinUrl;

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apollo enrichment failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  const p = data.person;
  if (!p) {
    return { email: null, emailStatus: null, person: null, remainingCredits: data.remaining_credits || 0 };
  }

  return {
    email: p.email || null,
    emailStatus: p.email_status || null,
    person: {
      id: p.id,
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      full_name: p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      email: p.email || null,
      title: p.title || null,
      organization_name: p.organization?.name || p.organization_name || null,
      organization_domain: p.organization?.website_url || p.organization?.primary_domain?.domain || null,
      linkedin_url: p.linkedin_url || null,
      photo_url: p.photo_url || null,
      city: p.city || null,
      country: p.country || null,
      seniority: p.seniority || null,
      departments: p.departments || [],
      email_status: p.email_status || null,
    },
    remainingCredits: data.remaining_credits || 0,
  };
}

/**
 * Check Apollo API credits remaining
 */
export async function getApiCredits(apiKey: string): Promise<number> {
  // Apollo doesn't have a dedicated credits endpoint, but search returns remaining_credits
  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      per_page: 1,
      page: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apollo API error (${res.status})`);
  }

  const data = await res.json();
  return data.remaining_credits || 0;
}
