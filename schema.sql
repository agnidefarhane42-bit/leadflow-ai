-- LeadFlow AI — Neon Database Schema
-- Run this in your Neon SQL editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (PME / devs accounts)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  company VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  plan VARCHAR(20) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100) DEFAULT 'landing',
  score INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'new',
  budget VARCHAR(100),
  need TEXT,
  timeline VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Appointments (RDV)
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  scheduled_at TIMESTAMP NOT NULL,
  duration INTEGER DEFAULT 30,
  status VARCHAR(20) DEFAULT 'pending',
  meeting_link TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Qualification responses
CREATE TABLE IF NOT EXISTS qualifications (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  score_weight INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_qualifications_lead_id ON qualifications(lead_id);
