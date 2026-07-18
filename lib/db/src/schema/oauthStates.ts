import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Temporary store for OIDC PKCE state.
 * Replaces browser cookies so mobile Safari ITP cannot wipe the values
 * during the cross-site redirect chain (app → OIDC provider → app).
 * Rows are deleted immediately after use and expire after 10 minutes.
 */
export const oauthStatesTable = pgTable("oauth_states", {
  state: varchar("state", { length: 128 }).primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  returnTo: text("return_to").notNull().default("/"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
