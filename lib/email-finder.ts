// Email Finder - House System (no API key needed, 100% free)
// 
// Pipeline:
// 1. AI generates company names + person names → find domains
// 2. Scrape company websites (sitemap.xml → team/about pages)
// 3. GitHub API: search org members (free, 60 req/hour, no key needed)
// 4. Generate email patterns from found names
// 5. Verify via MX records (DNS over HTTPS)
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
  source: string;
}

// ============================================
// MX RECORD CHECK — does the domain accept email?
// ============================================
export async function checkMXRecord(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`${DOH_BASE}?name=${domain}&type=MX`);
    const data = await res.json();
    const mxRecords = data.Answer?.filter((a: any) => a.type === 15) || [];
    if (mxRecords.length > 0) return true;
    const aRecords = data.Answer?.filter((a: any) => a.type === 1) || [];
    return aRecords.length > 0;
  } catch {
    return false;
  }
}

// ============================================
// FIND COMPANY DOMAIN — try common patterns + HEAD requests
// ============================================
export async function findCompanyDomain(companyName: string): Promise<string | null> {
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
    `${cleaned}.co`,
    `${cleaned}.africa`,
    `${cleaned}.ng`,
    `${cleaned}.com.ng`,
    ...(companyName.includes(" ")
      ? [companyName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + ".com"]
      : []),
  ];

  for (const domain of candidates) {
    try {
      const res = await fetch(`https://${domain}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(4000),
        redirect: "follow",
      });
      if (res.ok || [301, 302, 308].includes(res.status)) {
        return domain;
      }
    } catch {
      // try next
    }
  }
  return null;
}

// ============================================
// SITEMAP SCRAPING — fetch sitemap.xml, find team/about pages
// ============================================
async function getPagesFromSitemap(domain: string): Promise<string[]> {
  const pages: string[] = [];
  const sitemapUrls = [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemaps/sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadFlowAI/1.0)" },
      });
      if (!res.ok) continue;

      const xml = await res.text();
      // Extract URLs from sitemap
      const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
      for (const match of urlMatches) {
        const url = match[1].trim();
        // Look for team/about/people/contact pages
        if (/team|about|people|contact|staff|leadership|management|who-we-are|our-team/i.test(url)) {
          pages.push(url);
        }
      }
      if (pages.length > 0) break;
    } catch {
      // silent
    }
  }

  return pages.slice(0, 5); // limit to 5 pages
}

// ============================================
// SCRAPE EMAILS + NAMES FROM A WEB PAGE
// ============================================
export async function scrapeEmailsFromPage(url: string): Promise<{
  emails: string[];
  names: { firstName: string; lastName: string; position: string | null }[];
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadFlowAI/1.0)" },
      redirect: "follow",
    });

    if (!res.ok) return { emails: [], names: [] };

    const html = await res.text();

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = html.match(emailRegex) || [];

    const genericPrefixes = ["info", "contact", "support", "admin", "sales", "hello", "office", "noreply", "no-reply", "privacy", "legal", "press", "media", "help", "service", "team", "jobs", "careers"];
    const personalEmails = [...new Set(rawEmails)]
      .filter((e) => !genericPrefixes.some((g) => e.toLowerCase().startsWith(g + "@")))
      .filter((e) => !e.includes("example.com") && !e.includes("sentry.io") && !e.includes("wixpress") && !e.includes("schema.org"));

    // Extract names from HTML — look for common team member patterns
    const names: { firstName: string; lastName: string; position: string | null }[] = [];

    // Pattern 1: JSON-LD structured data (most reliable)
    const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const people = data.employee || data.employees || (data["@type"] === "Person" ? [data] : []);
        for (const emp of people) {
          if (emp.givenName && emp.familyName) {
            names.push({
              firstName: emp.givenName,
              lastName: emp.familyName,
              position: emp.jobTitle || emp.worksFor?.name || null,
            });
          } else if (emp.name && emp.name.includes(" ")) {
            const parts = emp.name.split(" ");
            names.push({ firstName: parts[0], lastName: parts.slice(1).join(" "), position: emp.jobTitle || null });
          }
        }
      } catch {
        // invalid JSON
      }
    }

    // Pattern 2: Common HTML patterns for team members
    const namePatterns = [
      /(?:class="[^"]*(?:team-name|member-name|person-name|employee-name|author-name|staff-name)[^"]*"[^>]*>)([^<]{3,50})</gi,
      /<h[34][^>]*(?:team|member|staff|author|person)[^>]*>([^<]{3,50})</gi,
      /data-name="([^"]{3,50})"/gi,
    ];

    for (const pattern of namePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const rawName = match[1].trim();
        const parts = rawName.split(/\s+/);
        if (parts.length >= 2 && parts.length <= 4) {
          if (parts[0][0] === parts[0][0].toUpperCase() && parts[1][0] === parts[1][0].toUpperCase()) {
            // Find position nearby
            const contextStart = Math.max(0, match.index! - 300);
            const contextEnd = Math.min(html.length, match.index! + 300);
            const context = html.slice(contextStart, contextEnd);
            const positionMatch = context.match(/\b(?:CEO|CTO|CFO|COO|CMO|Founder|Co-founder|Director|Manager|Head of|VP|President|Developer|Engineer|Designer|Consultant|Lead|Architect|Specialist|Analyst|Coordinator|Officer|Product|Tech|Sales|Marketing)\b/i);
            names.push({
              firstName: parts[0],
              lastName: parts.slice(1).join(" "),
              position: positionMatch?.[0] || null,
            });
          }
        }
      }
    }

    return {
      emails: personalEmails.slice(0, 20),
      names: names.slice(0, 20),
    };
  } catch {
    return { emails: [], names: [] };
  }
}

// ============================================
// GITHUB API — find org members with public emails (free, no key)
// 60 requests/hour without auth — enough for small batches
// ============================================
async function getGitHubOrgMembers(orgName: string): Promise<{
  name: string;
  email: string | null;
  login: string;
  bio: string | null;
}[]> {
  try {
    // First, try to find the GitHub org
    const orgRes = await fetch(`https://api.github.com/orgs/${orgName}/members?per_page=10`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "LeadFlowAI/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!orgRes.ok) {
      // Maybe it's a user, not an org
      const userRes = await fetch(`https://api.github.com/users/${orgName}`, {
        headers: { "Accept": "application/vnd.github+json", "User-Agent": "LeadFlowAI/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.email) {
          return [{ name: userData.name || userData.login, email: userData.email, login: userData.login, bio: userData.bio }];
        }
      }
      return [];
    }

    const members = await orgRes.json();
    const results: { name: string; email: string | null; login: string; bio: string | null }[] = [];

    // Get each member's profile (up to 10) to find public email
    for (const member of members.slice(0, 10)) {
      try {
        const profileRes = await fetch(`https://api.github.com/users/${member.login}`, {
          headers: { "Accept": "application/vnd.github+json", "User-Agent": "LeadFlowAI/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          results.push({
            name: profile.name || profile.login,
            email: profile.email,
            login: profile.login,
            bio: profile.bio,
          });
        }
      } catch {
        // skip
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ============================================
// GENERATE EMAIL PATTERNS
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

  if (!f || !l) return [];

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
// MAIN: Find prospects for a company using all available methods
// ============================================
export async function findCompanyProspects(
  domain: string,
  companyName: string,
  aiGeneratedNames?: { name: string; role: string | null }[]
): Promise<HouseProspect[]> {
  const prospects: HouseProspect[] = [];
  const foundEmails = new Set<string>();

  // Step 1: Check if domain has mail server
  const hasMX = await checkMXRecord(domain);
  if (!hasMX) {
    // No MX = domain doesn't accept email, skip
    return [];
  }

  // Step 2: Scrape homepage + sitemap-discovered pages
  const sitemapPages = await getPagesFromSitemap(domain);
  const pagesToScrape = [
    `https://${domain}`,
    `https://${domain}/team`,
    `https://${domain}/about`,
    `https://${domain}/about-us`,
    `https://${domain}/people`,
    `https://${domain}/our-team`,
    `https://${domain}/contact`,
    ...sitemapPages,
  ];

  // Deduplicate
  const uniquePages = [...new Set(pagesToScrape)].slice(0, 8);
  const scrapedNames: { firstName: string; lastName: string; position: string | null }[] = [];

  for (const pageUrl of uniquePages) {
    const result = await scrapeEmailsFromPage(pageUrl);
    result.emails.forEach((e: string) => foundEmails.add(e));
    scrapedNames.push(...result.names);
  }

  // Step 3: Add directly found emails (highest confidence)
  for (const email of Array.from(foundEmails)) {
    const domainPart = email.split("@")[1];
    if (domainPart && (domainPart === domain || domainPart === domain.replace(/^www\./, ""))) {
      const localPart = email.split("@")[0];
      let firstName = localPart.split(/[._\-]/)[0] || localPart;
      let lastName = localPart.split(/[._\-]/).slice(1).join(" ") || "";
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      if (lastName) lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);

      prospects.push({
        name: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
        email,
        company: companyName,
        domain,
        position: null,
        emailConfidence: 95,
        source: "website-scrape",
      });
    }
  }

  // Step 4: For scraped names, generate email patterns + verify via MX
  const uniqueScrapedNames = scrapedNames.slice(0, 10);
  for (const person of uniqueScrapedNames) {
    const patterns = generateEmailPatterns(person.firstName, person.lastName, domain);
    // Take the top pattern (highest confidence) — MX already verified
    if (patterns.length > 0) {
      const topPattern = patterns[0];
      if (!foundEmails.has(topPattern.email) && !prospects.some((p) => p.email === topPattern.email)) {
        prospects.push({
          name: `${person.firstName} ${person.lastName}`,
          email: topPattern.email,
          company: companyName,
          domain,
          position: person.position,
          emailConfidence: topPattern.confidence,
          source: `pattern-${topPattern.pattern}`,
        });
      }
    }
  }

  // Step 5: GitHub — try to find org members with public emails
  const githubOrgName = companyName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/\s+/g, "");

  const githubMembers = await getGitHubOrgMembers(githubOrgName);
  for (const member of githubMembers) {
    if (member.email) {
      if (!prospects.some((p) => p.email === member.email)) {
        const nameParts = member.name.split(" ");
        prospects.push({
          name: member.name,
          email: member.email,
          company: companyName,
          domain,
          position: member.bio?.slice(0, 50) || "Developer",
          emailConfidence: 85,
          source: "github-public",
        });
      }
    } else {
      const nameParts = member.name.split(" ");
      if (nameParts.length >= 2) {
      // No public email but we have a name — generate pattern
      const patterns = generateEmailPatterns(nameParts[0], nameParts.slice(1).join(" "), domain);
      if (patterns.length > 0 && !prospects.some((p) => p.email === patterns[0].email)) {
        prospects.push({
          name: member.name,
          email: patterns[0].email,
          company: companyName,
          domain,
          position: member.bio?.slice(0, 50) || "Developer",
          emailConfidence: patterns[0].confidence - 10,
          source: `github-pattern-${patterns[0].pattern}`,
        });
        }
      }
    }
  }

  // Step 6: AI-generated names — generate patterns (if provided)
  if (aiGeneratedNames && aiGeneratedNames.length > 0) {
    for (const person of aiGeneratedNames.slice(0, 5)) {
      const nameParts = person.name.split(" ");
      if (nameParts.length < 2) continue;

      const patterns = generateEmailPatterns(nameParts[0], nameParts.slice(1).join(" "), domain);
      for (const pattern of patterns.slice(0, 2)) {
        if (!prospects.some((p) => p.email === pattern.email)) {
          prospects.push({
            name: person.name,
            email: pattern.email,
            company: companyName,
            domain,
            position: person.role,
            emailConfidence: pattern.confidence - 20, // lower confidence for AI-generated names
            source: `ai-pattern-${pattern.pattern}`,
          });
          break;
        }
      }
    }
  }

  // Step 7: If still nothing, add generic contact email
  if (prospects.length === 0) {
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
