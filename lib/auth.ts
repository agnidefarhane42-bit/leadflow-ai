import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, users } from "./db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "leadflow-secret-change-in-production";
const COOKIE_NAME = "leadflow_session";
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days in seconds

const encoder = new TextEncoder();

function getSecretKey() {
  return encoder.encode(JWT_SECRET);
}

export interface SessionUser {
  id: number;
  email: string;
  fullName: string | null;
  company: string | null;
  plan: string | null;
  role: string | null;
}

// --- Password hashing ---
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- JWT token ---
export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// --- Cookie helpers ---
export async function setSessionCookie(user: SessionUser) {
  const token = await createToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

// --- Get current user from DB (for server components / API routes) ---
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Fetch fresh role from DB (in case it was updated after login)
  const userRows = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
  if (userRows.length === 0) return null;

  const dbUser = userRows[0];
  return {
    id: dbUser.id,
    email: dbUser.email,
    fullName: dbUser.fullName,
    company: dbUser.company,
    plan: dbUser.plan,
    role: dbUser.role || "user",
  };
}

// --- Check if current user is admin ---
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

// --- Require admin (throws/returns null if not) ---
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

// --- Auth: signup ---
export async function signup(email: string, password: string, fullName?: string, company?: string) {
  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { error: "Un compte existe déjà avec cet email" };
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      fullName: fullName || null,
      company: company || null,
    })
    .returning();

  // Create credit balance with 10 free credits
  const { initializeUserCredits } = await import("./credits");
  await initializeUserCredits(user.id);

  return { user };
}

// --- Auth: login ---
export async function login(email: string, password: string) {
  const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (userRows.length === 0) {
    return { error: "Email ou mot de passe incorrect" };
  }

  const user = userRows[0];
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Email ou mot de passe incorrect" };
  }

  return { user };
}
