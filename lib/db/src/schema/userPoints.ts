import { boolean, integer, jsonb, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { stagesTable } from "./stages";
import { ridersTable } from "./riders";

// Points earned per rider per user per stage (computed when stage is processed)
export const userStagePointsTable = pgTable("user_stage_points", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id),
  stageId: integer("stage_id")
    .notNull()
    .references(() => stagesTable.id),
  riderId: integer("rider_id")
    .notNull()
    .references(() => ridersTable.id),
  isCaptain: boolean("is_captain").notNull().default(false),
  oddsDecimal: numeric("odds_decimal", { precision: 10, scale: 2 }).notNull(),
  // Points before captain 2× multiplier
  basePoints: numeric("base_points", { precision: 10, scale: 2 }).notNull().default("0"),
  // sqrt(oddsDecimal) applied to base points
  oddsMultiplier: numeric("odds_multiplier", { precision: 10, scale: 4 }).notNull().default("1"),
  // Final points (base × oddsMultiplier × captainMultiplier)
  totalPoints: numeric("total_points", { precision: 10, scale: 2 }).notNull().default("0"),
  // Breakdown JSON: { stage, jerseys, kom, sprint, combative, penalty }
  breakdown: jsonb("breakdown").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserStagePoints = typeof userStagePointsTable.$inferSelect;
