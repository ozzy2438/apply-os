import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  goals: text("goals").notNull(),
  constraintsJson: text("constraints_json").notNull(),
  weightsJson: text("weights_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cvBullets = pgTable("cv_bullets", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  kind: text("kind").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  compensation: text("compensation"),
  url: text("url"),
  rawText: text("raw_text").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const evaluations = pgTable("evaluations", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  model: text("model").notNull(),
  demo: integer("demo").notNull(),
  answersJson: text("answers_json").notNull(),
  composedJson: text("composed_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const coverLetters = pgTable("cover_letters", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  body: text("body").notNull(),
  claimsJson: text("claims_json").notNull(),
  checkJson: text("check_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const briefings = pgTable("briefings", {
  briefDate: text("brief_date").primaryKey(),
  opportunityIdsJson: text("opportunity_ids_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const statusEvents = pgTable("status_events", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  at: text("at").notNull(),
});
