import { boolean, integer, jsonb, numeric, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { stagesTable } from "./stages";
import { ridersTable } from "./riders";

export const stageResultsTable = pgTable(
  "stage_results",
  {
    id: serial("id").primaryKey(),
    stageId: integer("stage_id")
      .notNull()
      .references(() => stagesTable.id),
    riderId: integer("rider_id")
      .notNull()
      .references(() => ridersTable.id),
    position: integer("position"), // null if DNF
    dnf: boolean("dnf").notNull().default(false),
    // Raw race stats used for point calculation
    komPointsEarned: integer("kom_points_earned").notNull().default(0),
    sprintPointsEarned: integer("sprint_points_earned").notNull().default(0),
    hadCombativeAward: boolean("had_combative_award").notNull().default(false),
    wearsYellow: boolean("wears_yellow").notNull().default(false),
    wearsGreen: boolean("wears_green").notNull().default(false),
    wearsPolkadot: boolean("wears_polkadot").notNull().default(false),
    wearsWhite: boolean("wears_white").notNull().default(false),
    // Computed fantasy points (before captain multiplier)
    pointsStage: numeric("points_stage", { precision: 10, scale: 2 }).notNull().default("0"),
    pointsJerseys: numeric("points_jerseys", { precision: 10, scale: 2 }).notNull().default("0"),
    pointsKom: numeric("points_kom", { precision: 10, scale: 2 }).notNull().default("0"),
    pointsSprint: numeric("points_sprint", { precision: 10, scale: 2 }).notNull().default("0"),
    pointsCombative: numeric("points_combative", { precision: 10, scale: 2 }).notNull().default("0"),
    pointsPenalty: numeric("points_penalty", { precision: 10, scale: 2 }).notNull().default("0"),
    fantasyPoints: numeric("fantasy_points", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("stage_results_stage_rider_idx").on(table.stageId, table.riderId)],
);

export type StageResult = typeof stageResultsTable.$inferSelect;
