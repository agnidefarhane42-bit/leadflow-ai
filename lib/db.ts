import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { pgTable, serial, text, timestamp, integer, varchar, boolean, jsonb } from "drizzle-orm/pg-core";

// ============================================
// EXISTING TABLES
// ============================================

// Users (PME / devs accounts)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull().default(""),
  fullName: varchar("full_name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  role: varchar("role", { length: 50 }).default("user"),
  plan: varchar("plan", { length: 20 }).default("free"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leads (existing)
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  source: varchar("source", { length: 100 }).default("landing"),
  score: integer("score").default(0),
  status: varchar("status", { length: 20 }).default("new"),
  budget: varchar("budget", { length: 100 }),
  need: text("need"),
  timeline: varchar("timeline", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Appointments (existing)
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  duration: integer("duration").default(30),
  status: varchar("status", { length: 20 }).default("pending"),
  meetingLink: text("meeting_link"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Qualification responses (existing)
export const qualifications = pgTable("qualifications", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  scoreWeight: integer("score_weight").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// CREDIT SYSTEM
// ============================================

export const creditBalances = pgTable("credit_balances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // signup_bonus, purchase, agent_run, refund
  description: varchar("description", { length: 500 }),
  referenceId: varchar("reference_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// AI AGENTS
// ============================================

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }),
  creditCost: integer("credit_cost").notNull().default(1),
  category: varchar("category", { length: 50 }).default("prospecting"),
  systemPrompt: text("system_prompt"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  input: jsonb("input"),
  output: jsonb("output"),
  creditsConsumed: integer("credits_consumed").notNull().default(0),
  status: varchar("status", { length: 20 }).default("pending"), // pending, running, completed, failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ============================================
// PROSPECTING
// ============================================

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  agentId: integer("agent_id").references(() => agents.id),
  status: varchar("status", { length: 20 }).default("draft"),
  targetCriteria: jsonb("target_criteria"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const prospects = pgTable("prospects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  company: varchar("company", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  linkedinUrl: varchar("linkedin_url", { length: 500 }),
  source: varchar("source", { length: 100 }).default("agent"),
  score: integer("score").default(0),
  status: varchar("status", { length: 20 }).default("new"),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const outreachMessages = pgTable("outreach_messages", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).default("email"), // email, linkedin, twitter
  subject: varchar("subject", { length: 500 }),
  content: text("content").notNull(),
  status: varchar("status", { length: 20 }).default("draft"), // draft, sent, replied, bounced
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Lazy DB connection (avoids build-time errors) ---
let _db: NeonHttpDatabase<Record<string, never>> | null = null;

export function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const sql = neon(connectionString);
    _db = drizzle(sql);
  }
  return _db;
}

export const db = new Proxy({} as NeonHttpDatabase<Record<string, never>>, {
  get(_target, prop) {
    const realDb = getDb();
    return Reflect.get(realDb, prop);
  },
});

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type Qualification = typeof qualifications.$inferSelect;
export type NewQualification = typeof qualifications.$inferInsert;
export type CreditBalance = typeof creditBalances.$inferSelect;
export type NewCreditBalance = typeof creditBalances.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
export type OutreachMessage = typeof outreachMessages.$inferSelect;
