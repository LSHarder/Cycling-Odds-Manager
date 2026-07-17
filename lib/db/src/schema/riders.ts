import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ridersTable = pgTable("riders", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  proTeam: varchar("pro_team", { length: 200 }).notNull(),
  nationality: varchar("nationality", { length: 100 }).notNull().default(""),
  oddsDecimal: numeric("odds_decimal", { precision: 10, scale: 2 }).notNull().default("10.00"),
  oddsLabel: varchar("odds_label", { length: 20 }).notNull().default("9/1"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").notNull().default(true),
  dnf: boolean("dnf").notNull().default(false),
  // jerseys: comma-separated list of "yellow","green","polkadot","white"
  currentJerseys: text("current_jerseys").array().notNull().default([]),
  pcsSlug: varchar("pcs_slug", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertRiderSchema = createInsertSchema(ridersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRider = z.infer<typeof insertRiderSchema>;
export type Rider = typeof ridersTable.$inferSelect;
