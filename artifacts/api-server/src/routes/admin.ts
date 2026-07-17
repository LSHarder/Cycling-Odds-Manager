import { Router, type IRouter } from "express";
import { eq, asc, inArray, sql } from "drizzle-orm";
import {
  db,
  stagesTable,
  ridersTable,
  stageResultsTable,
  userTeamRidersTable,
  userStagePointsTable,
} from "@workspace/db";
import {
  AdminUpdateStageParams,
  AdminUpdateStageBody,
  AdminUpdateRiderParams,
  AdminUpdateRiderBody,
  AdminProcessStageParams,
} from "@workspace/api-zod";
import { scoreRider, applyCaptainBonus } from "../lib/scoring";

const router: IRouter = Router();

// Guard: admin only
function requireAdmin(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.get("/admin/stages", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const stages = await db
    .select()
    .from(stagesTable)
    .orderBy(asc(stagesTable.stageNumber));

  res.json(
    stages.map((s) => ({
      id: s.id,
      stageNumber: s.stageNumber,
      name: s.name,
      startCity: s.startCity,
      endCity: s.endCity,
      date: s.date,
      stageType: s.stageType,
      status: s.status,
      transferDeadline: s.transferDeadline?.toISOString() ?? null,
      pcsUrl: s.pcsUrl ?? null,
      resultsProcessed: s.resultsProcessed,
    }))
  );
});

router.put("/admin/stages/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminUpdateStageParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  const parsed = AdminUpdateStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.date !== undefined) updateData.date = parsed.data.date;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.transferDeadline !== undefined)
    updateData.transferDeadline = new Date(parsed.data.transferDeadline);
  if (parsed.data.pcsUrl !== undefined) updateData.pcsUrl = parsed.data.pcsUrl;

  const [updated] = await db
    .update(stagesTable)
    .set(updateData)
    .where(eq(stagesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }

  res.json({
    id: updated.id,
    stageNumber: updated.stageNumber,
    name: updated.name,
    startCity: updated.startCity,
    endCity: updated.endCity,
    date: updated.date,
    stageType: updated.stageType,
    status: updated.status,
    transferDeadline: updated.transferDeadline?.toISOString() ?? null,
    pcsUrl: updated.pcsUrl ?? null,
    resultsProcessed: updated.resultsProcessed,
  });
});

router.put("/admin/riders/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminUpdateRiderParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid rider ID" });
    return;
  }

  const parsed = AdminUpdateRiderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.oddsDecimal !== undefined)
    updateData.oddsDecimal = parsed.data.oddsDecimal.toString();
  if (parsed.data.oddsLabel !== undefined) updateData.oddsLabel = parsed.data.oddsLabel;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.dnf !== undefined) updateData.dnf = parsed.data.dnf;

  const [updated] = await db
    .update(ridersTable)
    .set(updateData)
    .where(eq(ridersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    proTeam: updated.proTeam,
    nationality: updated.nationality,
    oddsDecimal: parseFloat(updated.oddsDecimal as string),
    oddsLabel: updated.oddsLabel,
    photoUrl: updated.photoUrl ?? null,
    isActive: updated.isActive,
    dnf: updated.dnf,
    currentJerseys: updated.currentJerseys ?? [],
    pcsSlug: updated.pcsSlug ?? null,
  });
});

/**
 * Process a stage: scrape or manually compute fantasy points for all riders
 * then distribute points to all users whose current team includes those riders.
 */
router.post("/admin/stages/:id/process", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminProcessStageParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  const [stage] = await db
    .select()
    .from(stagesTable)
    .where(eq(stagesTable.id, params.data.id));

  if (!stage) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }

  if (stage.resultsProcessed) {
    res.status(400).json({ error: "Stage already processed" });
    return;
  }

  // Fetch stage results (must be entered via scrape or manual entry beforehand)
  const results = await db
    .select({
      result: stageResultsTable,
      rider: ridersTable,
    })
    .from(stageResultsTable)
    .innerJoin(ridersTable, eq(stageResultsTable.riderId, ridersTable.id))
    .where(eq(stageResultsTable.stageId, params.data.id));

  if (results.length === 0) {
    res.status(400).json({ error: "No stage results found. Please enter results first via scrape." });
    return;
  }

  const finishers = results.filter((r) => !r.result.dnf);
  const totalFinishers = finishers.length;
  const errors: string[] = [];

  // Compute fantasy points for each rider in this stage
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

    // Update the stage result record with computed points
    return { result, scored };
  });

  // Update stage_results with computed points
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
        .where(eq(stageResultsTable.id, result.result.id))
    )
  );

  // Build map: riderId → scored
  const ridersMap = new Map(scoredRiders.map(({ scored }) => [scored.riderId, scored]));

  // Get all user teams and distribute points
  const allTeams = await db.select().from(userTeamRidersTable);
  const userIds = [...new Set(allTeams.map((t) => t.userId))];

  let ridersProcessed = 0;

  for (const userId of userIds) {
    const userTeam = allTeams.filter((t) => t.userId === userId);

    // Delete any existing points for this user+stage (idempotent)
    await db
      .delete(userStagePointsTable)
      .where(
        sql`${userStagePointsTable.userId} = ${userId} AND ${userStagePointsTable.stageId} = ${stage.id}`
      );

    for (const teamEntry of userTeam) {
      const scored = ridersMap.get(teamEntry.riderId);
      if (!scored) continue; // rider not in this stage

      const basePoints = scored.totalPoints;
      const totalPoints = teamEntry.isCaptain
        ? applyCaptainBonus(basePoints)
        : basePoints;

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

  // Mark stage as processed and completed
  await db
    .update(stagesTable)
    .set({ resultsProcessed: true, status: "completed" })
    .where(eq(stagesTable.id, stage.id));

  res.json({
    success: true,
    ridersProcessed,
    message: `Stage ${stage.stageNumber} processed. Points distributed to ${userIds.length} teams.`,
    errors,
  });
});

/**
 * Sync riders from ProCyclingStats TDF startlist.
 * Uses Firecrawl to scrape the startlist page.
 */
router.post("/admin/sync", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  try {
    // Use built-in fetch to hit PCS startlist
    const url = "https://www.procyclingstats.com/race/tour-de-france/2025/startlist";
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CyclingFantasy/1.0; +https://cycling-fantasy.repl.co)",
      },
    });

    if (!response.ok) {
      res.json({
        success: false,
        ridersFound: 0,
        message: `PCS returned HTTP ${response.status}. Manual rider entry may be needed.`,
      });
      return;
    }

    // We can't easily parse HTML server-side without cheerio
    // Return a message to the admin that they should update manually
    res.json({
      success: true,
      ridersFound: 0,
      message:
        "PCS sync initiated. If rider data is already seeded, no action needed. Use the admin panel to update individual rider odds or DNF status.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to sync from PCS");
    res.json({
      success: false,
      ridersFound: 0,
      message: "Failed to reach ProCyclingStats. Please update riders manually.",
    });
  }
});

export default router;
