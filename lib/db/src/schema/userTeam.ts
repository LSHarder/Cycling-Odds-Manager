import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { ridersTable } from "./riders";

// Current live team selection per user (max 8 riders + 1 captain)
export const userTeamRidersTable = pgTable("user_team_riders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id),
  riderId: integer("rider_id")
    .notNull()
    .references(() => ridersTable.id),
  isCaptain: boolean("is_captain").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserTeamRider = typeof userTeamRidersTable.$inferSelect;
