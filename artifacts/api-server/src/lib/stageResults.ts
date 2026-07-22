import { and, eq, sql } from "drizzle-orm";
import {
  db,
  ridersTable,
  stagesTable,
  stageResultsTable,
  userTeamRidersTable,
  userStagePointsTable,
  type Rider,
} from "@workspace/db";
import { applyCaptainBonus, scoreRider } from "./scoring";
import type { ScrapedStageResults } from "./pcsScraper";

export class ProcessStageError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface StageResultRow {
  riderId: number;
  position: number | null;
  dnf: boolean;
  komPointsEarned?: number;
  sprintPointsEarned?: number;
  hadCombativeAward?: boolean;
  wearsYellow?: boolean;
  wearsGreen?: boolean;
  wearsPolkadot?: boolean;
  wearsWhite?: boolean;
}

/**
 * Upserts stage_results rows keyed by (stageId, riderId). Only the fields
 * present on each row are written — omitted optional fields leave any
 * existing value untouched. The scraper path (applyScrapedResults) always
 * passes every optional field, so a scrape fully overwrites prior values;
 * the admin manual-entry path passes only what was typed, so it can correct
 * a single field without disturbing the rest.
 */
export async function upsertStageResultsForRiders(
  stageId: number,
  rows: StageResultRow[],
): Promise<void> {
  await Promise.all(
    rows.map((row) => {
      const optional: Record<string, unknown> = {};
      if (row.komPointsEarned !== undefined) optional.komPointsEarned = row.komPointsEarned;
      if (row.sprintPointsEarned !== undefined) optional.sprintPointsEarned = row.sprintPointsEarned;
      if (row.hadCombativeAward !== undefined) optional.hadCombativeAward = row.hadCombativeAward;
      if (row.wearsYellow !== undefined) optional.wearsYellow = row.wearsYellow;
      if (row.wearsGreen !== undefined) optional.wearsGreen = row.wearsGreen;
      if (row.wearsPolkadot !== undefined) optional.wearsPolkadot = row.wearsPolkadot;
      if (row.wearsWhite !== undefined) optional.wearsWhite = row.wearsWhite;

      return db
        .insert(stageResultsTable)
        .values({
          stageId,
          riderId: row.riderId,
          position: row.position,
          dnf: row.dnf,
          ...optional,
        })
        .onConflictDoUpdate({
          target: [stageResultsTable.stageId, stageResultsTable.riderId],
          set: { position: row.position, dnf: row.dnf, ...optional },
        });
    }),
  );
}

function normalizeNameTokens(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export interface ApplyScrapedResultsSummary {
  ridersMatched: number;
  ridersUnmatched: string[]; // pcsSlug or name of unmatched scraped rows
}

/**
 * Resolves each scraped rider (by pcsSlug, falling back to a normalized
 * name match) to a riderId in our DB, then upserts stage_results. On a
 * successful fallback name match, backfills the rider's pcsSlug so future
 * scrapes hit the fast path directly.
 */
export async function applyScrapedResults(
  stageId: number,
  scraped: ScrapedStageResults,
): Promise<ApplyScrapedResultsSummary> {
  const allRiders = await db.select().from(ridersTable);
  const bySlug = new Map<string, Rider>();
  const byNameTokens = new Map<string, Rider[]>();
  for (const rider of allRiders) {
    if (rider.pcsSlug) bySlug.set(rider.pcsSlug, rider);
    const key = normalizeNameTokens(rider.name);
    const bucket = byNameTokens.get(key) ?? [];
    bucket.push(rider);
    byNameTokens.set(key, bucket);
  }

  const rows: StageResultRow[] = [];
  const unmatched: string[] = [];
  const backfills: Array<{ riderId: number; pcsSlug: string }> = [];

  for (const scrapedRider of scraped.riders) {
    let rider = bySlug.get(scrapedRider.pcsSlug);
    if (!rider) {
      const candidates = byNameTokens.get(normalizeNameTokens(scrapedRider.name));
      if (candidates?.length === 1) {
        rider = candidates[0];
        backfills.push({ riderId: rider.id, pcsSlug: scrapedRider.pcsSlug });
      }
    }
    if (!rider) {
      unmatched.push(scrapedRider.pcsSlug || scrapedRider.name);
      continue;
    }

    rows.push({
      riderId: rider.id,
      position: scrapedRider.position,
      dnf: scrapedRider.dnf,
      komPointsEarned: scraped.komPointsBySlug.get(scrapedRider.pcsSlug) ?? 0,
      sprintPointsEarned: scraped.sprintPointsBySlug.get(scrapedRider.pcsSlug) ?? 0,
      hadCombativeAward: scraped.combativeRiderSlug === scrapedRider.pcsSlug,
      wearsYellow: scraped.jerseys.yellow === scrapedRider.pcsSlug,
      wearsGreen: scraped.jerseys.green === scrapedRider.pcsSlug,
      wearsPolkadot: scraped.jerseys.polkadot === scrapedRider.pcsSlug,
      wearsWhite: scraped.jerseys.white === scrapedRider.pcsSlug,
    });
  }

  await upsertStageResultsForRiders(stageId, rows);

  await Promise.all(
    backfills.map(({ riderId, pcsSlug }) =>
      db.update(ridersTable).set({ pcsSlug }).where(eq(ridersTable.id, riderId)),
    ),
  );

  return { ridersMatched: rows.length, ridersUnmatched: unmatched };
}

export interface ProcessStageResult {
  success: true;
  ridersProcessed: number;
  message: string;
  errors: string[];
}

/**
 * Scores every stage_results row for a stage and distributes points to every
 * user whose team includes those riders. Refactored out of the admin route
 * handler so the scheduler (scheduler.ts) can call it too.
 */
export async function processStage(stageId: number): Promise<ProcessStageResult> {
  const [stage] = await db.select().from(stagesTable).where(eq(stagesTable.id, stageId));
  if (!stage) {
    throw new ProcessStageError(404, "Stage not found");
  }
  if (stage.resultsProcessed) {
    throw new ProcessStageError(400, "Stage already processed");
  }

  const results = await db
    .select({ result: stageResultsTable, rider: ridersTable })
    .from(stageResultsTable)
    .innerJoin(ridersTable, eq(stageResultsTable.riderId, ridersTable.id))
    .where(eq(stageResultsTable.stageId, stageId));

  if (results.length === 0) {
    throw new ProcessStageError(
      400,
      "No stage results found. Please enter results first via scrape or manual entry.",
    );
  }

  const finishers = results.filter((r) => !r.result.dnf);
  const totalFinishers = finishers.length;
  const errors: string[] = [];

  const scoredRiders = results.map(({ result, rider }) => {
    const scored = scoreRider({
      riderId: rider.id,
      oddsDecimal: parseFloat(rider.oddsDecimal as string),
      position: result.position ?? null,
      dnf: result.dnf,
      totalFinishers,
      komPointsEarned: result.komPointsEarned,
      sprintPointsEarned: result.sprintPointsEarned,
      hadCombativeAward: result.hadCombativeAward,
      wearsYellow: result.wearsYellow,
      wearsGreen: result.wearsGreen,
      wearsPolkadot: result.wearsPolkadot,
      wearsWhite: result.wearsWhite,
    });
    return { result, scored };
  });

  await Promise.all(
    scoredRiders.map(({ result, scored }) =>
      db
        .update(stageResultsTable)
        .set({
          pointsStage: scored.breakdown.stage.toString(),
          pointsJerseys: scored.breakdown.jerseys.toString(),
          pointsKom: scored.breakdown.kom.toString(),
          pointsSprint: scored.breakdown.sprint.toString(),
          pointsCombative: scored.breakdown.combative.toString(),
          pointsPenalty: scored.breakdown.penalty.toString(),
          fantasyPoints: scored.totalPoints.toString(),
        })
        .where(eq(stageResultsTable.id, result.id)),
    ),
  );

  const ridersMap = new Map(scoredRiders.map(({ scored }) => [scored.riderId, scored]));

  const allTeams = await db.select().from(userTeamRidersTable);
  const userIds = [...new Set(allTeams.map((t) => t.userId))];

  let ridersProcessed = 0;

  for (const userId of userIds) {
    const userTeam = allTeams.filter((t) => t.userId === userId);

    await db
      .delete(userStagePointsTable)
      .where(
        and(eq(userStagePointsTable.userId, userId), eq(userStagePointsTable.stageId, stage.id)),
      );

    for (const teamEntry of userTeam) {
      const scored = ridersMap.get(teamEntry.riderId);
      if (!scored) continue;

      const basePoints = scored.totalPoints;
      const totalPoints = teamEntry.isCaptain ? applyCaptainBonus(basePoints) : basePoints;

      await db.insert(userStagePointsTable).values({
        userId,
        stageId: stage.id,
        riderId: teamEntry.riderId,
        isCaptain: teamEntry.isCaptain,
        oddsDecimal: scored.oddsDecimal.toString(),
        basePoints: basePoints.toString(),
        oddsMultiplier: scored.oddsMultiplier.toString(),
        totalPoints: totalPoints.toString(),
        breakdown: scored.breakdown,
      });

      ridersProcessed++;
    }
  }

  await db
    .update(stagesTable)
    .set({ resultsProcessed: true, status: "completed" })
    .where(eq(stagesTable.id, stage.id));

  return {
    success: true,
    ridersProcessed,
    message: `Stage ${stage.stageNumber} processed. Points distributed to ${userIds.length} teams.`,
    errors,
  };
}
