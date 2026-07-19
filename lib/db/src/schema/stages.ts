import { boolean, date, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stageTypeEnum = pgEnum("stage_type", ["flat", "hilly", "mountain", "time_trial", "rest"]);
export const stageStatusEnum = pgEnum("stage_status", ["upcoming", "transfer_closed", "live", "completed"]);

export const stagesTable = pgTable("stages", {
  id: serial("id").primaryKey(),
  stageNumber: integer("stage_number").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  startCity: varchar("start_city", { length: 200 }).notNull().default(""),
  endCity: varchar("end_city", { length: 200 }).notNull().default(""),
  date: date("date", { mode: "string" }).notNull(),
  stageType: stageTypeEnum("stage_type").notNull().default("flat"),
  status: stageStatusEnum("status").notNull().default("upcoming"),
  // Auto-scraped from PCS's time-table page (see pcsScraper.ts); transferDeadline
  // is auto-derived from this (startTime - 30min) whenever it's set, but can
  // still be overridden manually via PUT /admin/stages/:id.
  startTime: timestamp("start_time", { withTimezone: true }),
  transferDeadline: timestamp("transfer_deadline", { withTimezone: true }),
  pcsUrl: text("pcs_url"),
  resultsProcessed: boolean("results_processed").notNull().default(false),
  // Auto-scrape bookkeeping (see @workspace/api-server's scheduler.ts)
  pollingEnabled: boolean("polling_enabled").notNull().default(true),
  scrapeAttempts: integer("scrape_attempts").notNull().default(0),
  lastScrapeAttemptAt: timestamp("last_scrape_attempt_at", { withTimezone: true }),
  lastScrapeError: text("last_scrape_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStageSchema = createInsertSchema(stagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStage = z.infer<typeof insertStageSchema>;
export type Stage = typeof stagesTable.$inferSelect;
