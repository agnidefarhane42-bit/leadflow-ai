import { sql } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { pgTable, serial, text, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";

// --- Connection Neon ---
const connectionString = process.env.DATABASE_URL!;

const client = sql(connectionString);
export const db = drizzle(client);

// --- Schema ---

// Users (PME / devs accounts)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  fullName: varchar("full_name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  role: varchar("role", { length: 50 }).default("user"),
  plan: varchar("plan", { length: 20 }).default("free"), // free | pro
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leads
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  source: varchar("source", { length: 100 }).default("landing"), // linkedin | twitter | landing
  score: integer("score").default(0), // 0-100
  status: varchar("status", { length: 20 }).default("new"), // new | qualified | hot | warm | cold | converted
  budget: varchar("budget", { length: 100 }),
  need: text("need"),
  timeline: varchar("timeline", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Appointments (RDV)
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  duration: integer("duration").default(30), // minutes
  status: varchar("status", { length: 20 }).default("pending"), // pending | confirmed | cancelled | completed
  meetingLink: text("meeting_link"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Qualification responses
export const qualifications = pgTable("qualifications", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  scoreWeight: integer("score_weight").default(0),
  createdAt: timestamp("created_at").defaultNow(),
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
