// Snov.io API integration
// Free plan: 50 credits/month. API access requires requesting test access
// by emailing help@snov.io from your free account.
//
// All Snov.io API calls are ASYNC:
// 1. POST to start a task → returns task_hash
// 2. Poll GET with task_hash → returns results when ready
//
// Authentication: OAuth client_credentials → access_token (valid 1 hour)

const SNOV_BASE = "https://api.snov.io";

// Token cache (valid for 1 hour)
let cachedToken: string | null = null;
let tokenExpiry = 0;

export interface SnovCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Authenticate and get access token (cached for 1 hour)
 */
export async function getAccessToken(creds: SnovCredentials): Promise<string> {
  // Check cache
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken as string;
  }

  const res = await fetch(`${SNOV_BASE}/v1/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(`Snov.io auth failed: ${data.error || data.message || "Unknown error"}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

  return cachedToken as string;
}

/**
 * Helper: poll for async task result
 * Snov.io tasks are async — POST starts the task, GET retrieves results
 */
async function pollTaskResult(
  token: string,
  resultUrl: string,
  maxAttempts = 10,
  intervalMs = 2000
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    // Check if completed
    if (data.status === "completed" || data.data?.status === "completed") {
      return data;
    }

    // Some endpoints return results directly
    if (data.emails || data.prospects || data.domains || data.results) {
      return data;
    }

    // If still in progress, keep polling
    if (data.status === "in_progress" || data.data?.status === "in_progress") {
      continue;
    }

    // If we got data without explicit status, return it
    if (data.data || data.result || Object.keys(data).length > 2) {
      return data;
    }
  }

  throw new Error("Snov.io task timed out");
}

export interface SnovDomainEmail {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  status: string | null;
  source: string | null;
}

export interface SnovProspect {
  prospectId: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  sourcePage: string | null;
  prospectHash: string | null;
}

export interface SnovEmailResult {
  email: string | null;
  status: string | null;
  firstName: string | null;
  lastName: string | null;
  domain: string | null;
}

// ============================================
// DOMAIN EMAILS — get all emails at a domain
// POST /v2/domain-search/domain-emails/start
// GET /v2/domain-search/domain-emails/result/{task_hash}
// ============================================
export async function getDomainEmails(
  creds: SnovCredentials,
  domain: string,
  maxWaitMs = 20000
): Promise<SnovDomainEmail[]> {
  const token = await getAccessToken(creds);

  // Step 1: Start the search
  const startRes = await fetch(`${SNOV_BASE}/v2/domain-search/domain-emails/start?domain=${domain}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const startData = await startRes.json();

  if (!startRes.ok) {
    throw new Error(`Snov.io domain emails start failed: ${startData.error || startData.message}`);
  }

  const resultUrl = startData.result || `${SNOV_BASE}/v2/domain-search/domain-emails/result/${startData.task_hash}`;
  if (!resultUrl || !startData.task_hash) {
    throw new Error("Snov.io: no task_hash returned");
  }

  // Step 2: Poll for results
  const maxAttempts = Math.floor(maxWaitMs / 2000);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.data?.status === "completed") {
      const emails = data.data?.emails || data.emails || [];
      return emails.map((e: any) => ({
        email: e.email || e.value || "",
        firstName: e.first_name || null,
        lastName: e.last_name || null,
        position: e.position || e.job_title || null,
        status: e.status || null,
        source: e.source || null,
      }));
    }

    if (data.status === "in_progress") continue;
    if (data.emails || data.data?.emails) {
      const emails = data.emails || data.data?.emails || [];
      return emails.map((e: any) => ({
        email: e.email || e.value || "",
        firstName: e.first_name || null,
        lastName: e.last_name || null,
        position: e.position || e.job_title || null,
        status: e.status || null,
        source: e.source || null,
      }));
    }
  }

  return [];
}

// ============================================
// DOMAIN SEARCH PROSPECTS — find people at a domain
// POST /v2/domain-search/prospects/start
// GET /v2/domain-search/prospects/result/{task_hash}
// ============================================
export async function getDomainProspects(
  creds: SnovCredentials,
  domain: string,
  positions?: string[],
  maxWaitMs = 20000
): Promise<SnovProspect[]> {
  const token = await getAccessToken(creds);

  const startUrl = `${SNOV_BASE}/v2/domain-search/prospects/start?domain=${domain}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: positions ? JSON.stringify({ positions }) : undefined,
  });

  const startData = await startRes.json();

  if (!startRes.ok) {
    throw new Error(`Snov.io prospects start failed: ${startData.error || startData.message}`);
  }

  const resultUrl = startData.result || `${SNOV_BASE}/v2/domain-search/prospects/result/${startData.task_hash}`;
  if (!startData.task_hash) throw new Error("Snov.io: no task_hash");

  const maxAttempts = Math.floor(maxWaitMs / 2000);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.data?.status === "completed") {
      const prospects = data.data?.prospects || data.prospects || [];
      return prospects.map((p: any) => ({
        prospectId: p.id || p.prospect_id || "",
        firstName: p.first_name || null,
        lastName: p.last_name || null,
        position: p.position || null,
        sourcePage: p.source_page || null,
        prospectHash: p.search_emails_start?.match(/([a-f0-9]+)/)?.[1] || null,
      }));
    }

    if (data.status === "in_progress") continue;
    if (data.prospects || data.data?.prospects) {
      const prospects = data.prospects || data.data?.prospects || [];
      return prospects.map((p: any) => ({
        prospectId: p.id || p.prospect_id || "",
        firstName: p.first_name || null,
        lastName: p.last_name || null,
        position: p.position || null,
        sourcePage: p.source_page || null,
        prospectHash: p.search_emails_start?.match(/([a-f0-9]+)/)?.[1] || null,
      }));
    }
  }

  return [];
}

// ============================================
// PROSPECT EMAIL — find email for a specific prospect
// POST /v2/domain-search/prospects/search-emails/start/{prospect_hash}
// GET /v2/domain-search/prospects/search-emails/result/{task_hash}
// ============================================
export async function getProspectEmail(
  creds: SnovCredentials,
  prospectHash: string,
  maxWaitMs = 20000
): Promise<{ email: string | null; status: string | null }> {
  const token = await getAccessToken(creds);

  const startRes = await fetch(
    `${SNOV_BASE}/v2/domain-search/prospects/search-emails/start/${prospectHash}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const startData = await startRes.json();

  if (!startRes.ok) {
    throw new Error(`Snov.io prospect email start failed: ${startData.error || startData.message}`);
  }

  const resultUrl = startData.result || `${SNOV_BASE}/v2/domain-search/prospects/search-emails/result/${startData.task_hash}`;
  if (!startData.task_hash) throw new Error("Snov.io: no task_hash");

  const maxAttempts = Math.floor(maxWaitMs / 2000);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.data?.status === "completed") {
      const email = data.data?.email || data.email || null;
      const status = data.data?.status || data.email_status || null;
      return { email, status };
    }

    if (data.status === "in_progress") continue;
    if (data.email || data.data?.email) {
      return {
        email: data.data?.email || data.email || null,
        status: data.data?.email_status || data.status || null,
      };
    }
  }

  return { email: null, status: null };
}

// ============================================
// EMAIL FINDER — find email from name + domain (bulk, up to 10)
// POST /v2/emails-by-domain-by-name/start
// GET /v2/emails-by-domain-by-name/start/result?task_hash=
// ============================================
export async function findEmailsByNameAndDomain(
  creds: SnovCredentials,
  prospects: { firstName: string; lastName: string; domain: string }[],
  maxWaitMs = 30000
): Promise<SnovEmailResult[]> {
  const token = await getAccessToken(creds);

  const startRes = await fetch(`${SNOV_BASE}/v2/emails-by-domain-by-name/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rows: prospects.map((p) => ({
        first_name: p.firstName,
        last_name: p.lastName,
        domain: p.domain,
      })),
    }),
  });

  const startData = await startRes.json();

  if (!startRes.ok) {
    throw new Error(`Snov.io email finder start failed: ${startData.error || startData.message}`);
  }

  const taskHash = startData.task_hash;
  if (!taskHash) throw new Error("Snov.io: no task_hash");

  const resultUrl = `${SNOV_BASE}/v2/emails-by-domain-by-name/start/result?task_hash=${taskHash}`;

  const maxAttempts = Math.floor(maxWaitMs / 2000);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.data?.status === "completed") {
      const results = data.data?.results || data.results || [];
      return results.map((r: any) => ({
        email: r.email || null,
        status: r.status || r.email_status || null,
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        domain: r.domain || null,
      }));
    }

    if (data.status === "in_progress") continue;
    if (data.results || data.data?.results) {
      const results = data.results || data.data?.results || [];
      return results.map((r: any) => ({
        email: r.email || null,
        status: r.status || r.email_status || null,
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        domain: r.domain || null,
      }));
    }
  }

  return [];
}

// ============================================
// COMPANY TO DOMAIN — find domain from company name (bulk, up to 10)
// POST /v2/company-domain-by-name/start
// GET /v2/company-domain-by-name/result?task_hash=
// ============================================
export async function getDomainFromCompanyName(
  creds: SnovCredentials,
  companyNames: string[],
  maxWaitMs = 20000
): Promise<{ name: string; domain: string | null }[]> {
  const token = await getAccessToken(creds);

  const startRes = await fetch(`${SNOV_BASE}/v2/company-domain-by-name/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      names: companyNames,
    }),
  });

  const startData = await startRes.json();

  if (!startRes.ok) {
    throw new Error(`Snov.io company-domain start failed: ${startData.error || startData.message}`);
  }

  const taskHash = startData.task_hash;
  if (!taskHash) throw new Error("Snov.io: no task_hash");

  const resultUrl = `${SNOV_BASE}/v2/company-domain-by-name/result?task_hash=${taskHash}`;

  const maxAttempts = Math.floor(maxWaitMs / 2000);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.data?.status === "completed") {
      const results = data.data?.results || data.results || [];
      return results.map((r: any) => ({
        name: r.name || "",
        domain: r.domain || null,
      }));
    }

    if (data.status === "in_progress") continue;
    if (data.results || data.data?.results) {
      const results = data.results || data.data?.results || [];
      return results.map((r: any) => ({
        name: r.name || "",
        domain: r.domain || null,
      }));
    }
  }

  return companyNames.map((name) => ({ name, domain: null }));
}

// ============================================
// EMAIL VERIFIER — verify email deliverability
// POST /v2/email-verification/start
// GET /v2/email-verification/result?task_hash=
// ============================================
export async function verifyEmail(
  creds: SnovCredentials,
  emails: string[],
  maxWaitMs = 20000
): Promise<{ email: string; status: string; reason: string | null }[]> {
  const token = await getAccessToken(creds);

  const startRes = await fetch(`${SNOV_BASE}/v2/email-verification/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emails }),
  });

  const startData = await startRes.json();

  if (!startRes.ok) {
    throw new Error(`Snov.io verification start failed: ${startData.error || startData.message}`);
  }

  const taskHash = startData.task_hash;
  if (!taskHash) throw new Error("Snov.io: no task_hash");

  const resultUrl = `${SNOV_BASE}/v2/email-verification/result?task_hash=${taskHash}`;

  const maxAttempts = Math.floor(maxWaitMs / 2000);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.status === "completed" || data.data?.status === "completed") {
      const results = data.data?.results || data.results || [];
      return results.map((r: any) => ({
        email: r.email || "",
        status: r.status || r.result || "unknown",
        reason: r.reason || null,
      }));
    }

    if (data.status === "in_progress") continue;
    if (data.results || data.data?.results) {
      const results = data.results || data.data?.results || [];
      return results.map((r: any) => ({
        email: r.email || "",
        status: r.status || r.result || "unknown",
        reason: r.reason || null,
      }));
    }
  }

  return emails.map((email) => ({ email, status: "unknown", reason: null }));
}
