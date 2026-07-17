import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, userStagePointsTable, stagesTable, usersTable } from "@workspace/db";
import { GetStagePointsParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/points/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const pointRows = await db
    .select({
      stageId: userStagePointsTable.stageId,
      totalPoints: sql<number>`SUM(${userStagePointsTable.totalPoints})::numeric`,
    })
    .from(userStagePointsTable)
    .where(eq(userStagePointsTable.userId, req.user.id))
    .groupBy(userStagePointsTable.stageId);

  const stageIds = pointRows.map((r) => r.stageId);
  const stages =
    stageIds.length > 0
      ? await db
          .select()
          .from(stagesTable)
          .where(sql`${stagesTable.id} = ANY(${stageIds})`)
      : [];

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const totalPoints = pointRows.reduce(
    (sum, r) => sum + parseFloat(String(r.totalPoints)),
    0
  );

  const stageBreakdown = pointRows
    .map((r) => {
      const s = stageMap.get(r.stageId);
      return {
        stageId: r.stageId,
        stageNumber: s?.stageNumber ?? 0,
        stageName: s?.name ?? `Stage ${r.stageId}`,
        points: parseFloat(String(r.totalPoints)),
      };
    })
    .sort((a, b) => a.stageNumber - b.stageNumber);

  const user = req.user;
  res.json({
    totalPoints: Math.round(totalPoints * 100) / 100,
    teamName: user.teamName ?? null,
    stageBreakdown,
  });
});

router.get("/points/stage/:stageId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawId = Array.isArray(req.params.stageId)
    ? req.params.stageId[0]
    : req.params.stageId;
  const params = GetStagePointsParams.safeParse({ stageId: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  const [stage] = await db
    .select()
    .from(stagesTable)
    .where(eq(stagesTable.id, params.data.stageId));

  if (!stage) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }

  const rows = await db
    .select()
    .from(userStagePointsTable)
    .where(
      sql`${userStagePointsTable.userId} = ${req.user.id} AND ${userStagePointsTable.stageId} = ${params.data.stageId}`
    );

  const totalPoints = rows.reduce(
    (sum, r) => sum + parseFloat(String(r.totalPoints)),
    0
  );

  const riderPoints = rows.map((r) => {
    const breakdown = (r.breakdown as any) ?? {};
    return {
      stageId: r.stageId,
      stageNumber: stage.stageNumber,
      stageName: stage.name,
      riderId: r.riderId,
      riderName: "",
      isCaptain: r.isCaptain,
      oddsDecimal: parseFloat(r.oddsDecimal as string),
      basePoints: parseFloat(r.basePoints as string),
      multiplier: parseFloat(r.oddsMultiplier as string),
      totalPoints: parseFloat(r.totalPoints as string),
      breakdown: {
        stage: breakdown.stage ?? 0,
        jerseys: breakdown.jerseys ?? 0,
        kom: breakdown.kom ?? 0,
        sprint: breakdown.sprint ?? 0,
        combative: breakdown.combative ?? 0,
        penalty: breakdown.penalty ?? 0,
      },
    };
  });

  res.json({
    stageId: stage.id,
    stageNumber: stage.stageNumber,
    stageName: stage.name,
    totalPoints: Math.round(totalPoints * 100) / 100,
    riderPoints,
  });
});

export default router;
