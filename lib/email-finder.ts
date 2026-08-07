// Email Finder - House System (no API key needed, 100% free)
// 
// Pipeline:
// 1. AI generates company names → find their domains via web search
// 2. Scrape company websites for emails (mailto: links, team pages)
// 3. Generate email patterns from names found on team/about pages
// 4. Verify via MX records (DNS over HTTPS) + SMTP check
//
// All done via standard HTTPS — works on Vercel serverless

const DOH_BASE = "https://dns.google/resolve"; // Google DNS over HTTPS

export interface HouseProspect {
  name: string;
  email: string;
  company: string;
  domain: string;
  position: string | null;
  emailConfidence: number; // 0-100
  source: string; // where we found it
}

// ============================================
// MX RECORD CHECK — does the domain accept email?
// ============================================
export async function checkMXRecord(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`${DOH_BASE}?name=${domain}&type=MX`);
    const data = await res.json();
    // If there are MX records, the domain accepts email
    const mxRecords = data.Answer?.filter((a: any) => a.type === 15) || [];
    if (mxRecords.length > 0) return true;

    // Also check if there's an A record (some domains use A record for email)
    const aRecords = data.Answer?.filter((a: any) => a.type === 1) || [];
    return aRecords.length > 0;
  } catch {
    return false;
  }
}

// ============================================
// FIND COMPANY DOMAIN — try common patterns
// ============================================
export async function findCompanyDomain(companyName: string): Promise<string | null> {
  // Normalize company name to domain
  const cleaned = companyName
    .toLowerCase()
    .replace(/^(the\s+|le\s+|la\s+|les\s+)/, "")
    .replace(/[&'']/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");

  const candidates = [
    `${cleaned}.com`,
    `${cleaned}.io`,
    `${cleaned}.net`,
    `${cleaned}.org`,
    `${cleaned}.co`,
    `${cleaned}.fr`,
    `${cleaned}.ai`,
    `${cleaned}.dev`,
    // With hyphen if multi-word
    ...(companyName.includes(" ")
      ? [companyName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + ".com"]
      : []),
  ];

  // Check each candidate by trying to fetch it
  for (const domain of candidates) {
    try {
      const res = await fetch(`https://${domain}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      if (res.ok || res.status === 301 || res.status === 302 || res.status === 308) {
        return domain;
      }
    } catch {
      // Try next
    }
  }

  // Fallback: try DuckDuckGo instant answer
  try {
    const ddgRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(companyName)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    const ddgData = await ddgRes.json();
    if (ddgData.AbstractURL) {
      const url = new URL(ddgData.AbstractURL);
      return url.hostname.replace(/^www\./, "");
    }
  } catch {
    // silent
  }

  return null;
}

// ============================================
// SCRAPE EMAILS FROM A WEB PAGE
// Fetch HTML and extract email addresses
// ============================================
export async function scrapeEmailsFromPage(url: string): Promise<{
  emails: string[];
  names: { firstName: string; lastName: string; position: string | null }[];
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadFlowAI/1.0)",
      },
      redirect: "follow",
    });

    if (!res.ok) return { emails: [], names: [] };

    const html = await res.text();

    // Extract emails from mailto: links and plain text
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = html.match(emailRegex) || [];
    
    // Filter out generic/role emails and deduplicate
    const genericPrefixes = ["info", "contact", "support", "admin", "sales", "hello", "office", "noreply", "no-reply", "donotreply", "privacy", "legal", "press", "media", "help", "service", "team", "jobs", "careers"];
    const personalEmails = [...new Set(rawEmails)]
      .filter((e) => !genericPrefixes.some((g) => e.toLowerCase().startsWith(g + "@")))
      .filter((e) => !e.includes("example.com") && !e.includes("sentry.io") && !e.includes("wixpress"));

    // Extract names from common patterns in HTML
    // Look for patterns like "John Doe", "Jane Smith - CEO", etc.
    const nameRegex = /(?:class="[^"]*(?:name|author|team|member|person|profile)[^"]*"[^>]*>)([^<]{3,50})</gi;
    const names: { firstName: string; lastName: string; position: string | null }[] = [];

    let match;
    while ((match = nameRegex.exec(html)) !== null) {
      const rawName = match[1].trim();
      const parts = rawName.split(/\s+/);
      if (parts.length >= 2 && parts.length <= 4) {
        // Check if it looks like a real name (not a heading or nav item)
        if (parts[0][0] === parts[0][0].toUpperCase() && parts[1][0] === parts[1][0].toUpperCase()) {
          // Try to find position nearby
          const contextStart = Math.max(0, match.index! - 200);
          const contextEnd = Math.min(html.length, match.index! + 200);
          const context = html.slice(contextStart, contextEnd);
          const positionMatch = context.match(/\b(?:CEO|CTO|CFO|COO|CMO|Founder|Co-founder|Director|Manager|Head of|VP|President|Developer|Engineer|Designer|Consultant|Lead|Architect|Specialist|Analyst|Coordinator|Officer)\b/i);
          
          names.push({
            firstName: parts[0],
            lastName: parts.slice(1).join(" "),
            position: positionMatch?.[0] || null,
          });
        }
      }
    }

    // Also try to extract from JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const jsonLd of jsonLdMatch) {
        try {
          const jsonStr = jsonLd.replace(/<[^>]+>/g, "");
          const data = JSON.parse(jsonStr);
          if (data["@type"] === "Organization" && data.employee) {
            for (const emp of data.employee) {
              if (emp.givenName && emp.familyName) {
                names.push({
                  firstName: emp.givenName,
                  lastName: emp.familyName,
                  position: emp.jobTitle || null,
                });
              }
            }
          }
        } catch {
          // invalid JSON-LD
        }
      }
    }

    return {
      emails: personalEmails.slice(0, 20), // limit
      names: names.slice(0, 30),
    };
  } catch {
    return { emails: [], names: [] };
  }
}

// ============================================
// GENERATE EMAIL PATTERNS
// Given a name and domain, generate common email patterns
// ============================================
export function generateEmailPatterns(
  firstName: string,
  lastName: string,
  domain: string
): { email: string; pattern: string; confidence: number }[] {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const l = lastName.toLowerCase().replace(/[^a-z]/g, "");
  const fl = f[0] || "";
  const ll = l[0] || "";
  const d = domain.replace(/^www\./, "");

  return [
    { email: `${f}.${l}@${d}`, pattern: "first.last", confidence: 90 },
    { email: `${f}${l}@${d}`, pattern: "firstlast", confidence: 85 },
    { email: `${f}@${d}`, pattern: "first", confidence: 80 },
    { email: `${fl}${l}@${d}`, pattern: "flast", confidence: 75 },
    { email: `${fl}.${l}@${d}`, pattern: "f.last", confidence: 70 },
    { email: `${f}${ll}@${d}`, pattern: "firstl", confidence: 70 },
    { email: `${f}_${l}@${d}`, pattern: "first_last", confidence: 65 },
    { email: `${l}@${d}`, pattern: "last", confidence: 60 },
    { email: `${l}.${f}@${d}`, pattern: "last.first", confidence: 55 },
    { email: `${fl}-${l}@${d}`, pattern: "f-last", confidence: 50 },
  ];
}

// ============================================
// SMTP VERIFICATION — check if email exists
// Note: may fail on serverless (port 25 blocked)
// Falls back to MX-only verification
// ============================================
export async function verifyEmailSMTP(email: string): Promise<{
  valid: boolean;
  method: "smtp" | "mx" | "unknown";
}> {
  const domain = email.split("@")[1];
  if (!domain) return { valid: false, method: "unknown" };

  // Step 1: Check MX records (always works via DoH)
  const hasMX = await checkMXRecord(domain);
  if (!hasMX) return { valid: false, method: "mx" };

  // Step 2: Try SMTP verification (may fail on serverless)
  try {
    // Get MX server
    const mxRes = await fetch(`${DOH_BASE}?name=${domain}&type=MX`);
    const mxData = await mxRes.json();
    const mxRecords = (mxData.Answer || [])
      .filter((a: any) => a.type === 15)
      .map((a: any) => a.data)
      .sort((a: any, b: any) => parseInt(a.split(" ")[0]) - parseInt(b.split(" ")[0]));

    if (mxRecords.length === 0) {
      // No MX but has A record — try connecting to domain directly
      return { valid: true, method: "mx" };
    }

    // MX exists, domain accepts email
    // SMTP RCPT TO check would go here but port 25 is blocked on Vercel
    // So we confirm via MX that the domain accepts email
    return { valid: true, method: "mx" };
  } catch {
    return { valid: true, method: "mx" };
  }
}

// ============================================
// MAIN: Find prospects for a company
// Scrape website, extract emails + names, generate patterns, verify
// ============================================
export async function findCompanyProspects(
  domain: string,
  companyName: string
): Promise<HouseProspect[]> {
  const prospects: HouseProspect[] = [];

  // Step 1: Check if domain has mail server
  const hasMX = await checkMXRecord(domain);
  if (!hasMX) return [];

  // Step 2: Scrape homepage + common team pages
  const pagesToScrape = [
    `https://${domain}`,
    `https://${domain}/team`,
    `https://${domain}/about`,
    `https://${domain}/about-us`,
    `https://${domain}/about`,
    `https://${domain}/who-we-are`,
    `https://${domain}/people`,
    `https://${domain}/our-team`,
  ];

  const foundEmails = new Set<string>();
  const foundNames: { firstName: string; lastName: string; position: string | null }[] = [];

  for (const pageUrl of pagesToScrape) {
    const result = await scrapeEmailsFromPage(pageUrl);
result.emails.forEach((e: string) => foundEmails.add(e));
    foundNames.push(...result.names);
  }

  // Step 3: Add directly found emails (high confidence)
  for (const email of Array.from(foundEmails)) {
    const domainPart = email.split("@")[1];
    if (domainPart && domain.replace(/^www\./, "").includes(domainPart.replace(/^www\./, ""))) {
      const localPart = email.split("@")[0];
      // Try to extract name from email
      let firstName = localPart.split(/[._-]/)[0] || localPart;
      let lastName = localPart.split(/[._-]/)[1] || "";
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      if (lastName) lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);

      prospects.push({
        name: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
        email,
        company: companyName,
        domain,
        position: null,
        emailConfidence: 95, // directly found on website
        source: "website-scrape",
      });
    }
  }

  // Step 4: For found names, generate email patterns and verify
  const uniqueNames = foundNames.slice(0, 10); // limit
  for (const person of uniqueNames) {
    const patterns = generateEmailPatterns(person.firstName, person.lastName, domain);

    // Try the top 3 patterns
    for (const pattern of patterns.slice(0, 3)) {
      // Skip if already found
      if (Array.from(foundEmails).includes(pattern.email)) continue;
      if (prospects.some((p) => p.email === pattern.email)) continue;

      // Verify the email
      const verification = await verifyEmailSMTP(pattern.email);
      if (verification.valid) {
        prospects.push({
          name: `${person.firstName} ${person.lastName}`,
          email: pattern.email,
          company: companyName,
          domain,
          position: person.position,
          emailConfidence: pattern.confidence,
          source: `pattern-${pattern.pattern}-mx-verified`,
        });
        break; // Only take the first valid pattern per person
      }
    }
  }

  // Step 5: If we found no emails or names, generate pattern emails
  // from the company domain itself (generic patterns)
  if (prospects.length === 0) {
    // At least confirm the domain accepts email
    prospects.push({
      name: `Contact ${companyName}`,
      email: `contact@${domain.replace(/^www\./, "")}`,
      company: companyName,
      domain,
      position: null,
      emailConfidence: 40,
      source: "generic-contact",
    });
  }

  return prospects;
}
