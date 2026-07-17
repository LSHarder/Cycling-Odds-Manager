import { Router, type IRouter } from "express";
import { asc, eq, desc } from "drizzle-orm";
import { db, stagesTable, stageResultsTable, ridersTable } from "@workspace/db";
import { GetStageParams } from "@workspace/api-zod";

const router: IRouter = Router();

function formatStage(s: typeof stagesTable.$inferSelect) {
  return {
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
  };
}

router.get("/stages", async (_req, res): Promise<void> => {
  const stages = await db
    .select()
    .from(stagesTable)
    .orderBy(asc(stagesTable.stageNumber));
  res.json(stages.map(formatStage));
});

router.get("/stages/current", async (_req, res): Promise<void> => {
  // Find the first non-completed stage
  const stages = await db
    .select()
    .from(stagesTable)
    .orderBy(asc(stagesTable.stageNumber));

  const current = stages.find(
    (s) => s.status === "upcoming" || s.status === "transfer_closed" || s.status === "live"
  ) ?? stages[stages.length - 1];

  if (!current) {
    res.status(404).json({ error: "No active stage found" });
    return;
  }

  const now = new Date();
  const deadline = current.transferDeadline ? new Date(current.transferDeadline) : null;
  const transferWindowOpen =
    current.status === "upcoming" && deadline !== null && now < deadline;
  const minutesUntilClose =
    transferWindowOpen && deadline
      ? Math.floor((deadline.getTime() - now.getTime()) / 60000)
      : null;

  res.json({
    stage: formatStage(current),
    transferWindowOpen,
    minutesUntilClose,
  });
});

router.get("/stages/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetStageParams.safeParse({ id: parseInt(rawId, 10) });
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

  const rawResults = await db
    .select({
      result: stageResultsTable,
      rider: ridersTable,
    })
    .from(stageResultsTable)
    .innerJoin(ridersTable, eq(stageResultsTable.riderId, ridersTable.id))
    .where(eq(stageResultsTable.stageId, params.data.id))
    .orderBy(asc(stageResultsTable.position), desc(stageResultsTable.fantasyPoints));

  const results = rawResults.map(({ result, rider }) => ({
    id: result.id,
    stageId: result.stageId,
    riderId: result.riderId,
    riderName: rider.name,
    proTeam: rider.proTeam,
    position: result.position ?? null,
    dnf: result.dnf,
    fantasyPoints: parseFloat(result.fantasyPoints as string),
    pointsBreakdown: {
      stage: parseFloat(result.pointsStage as string),
      jerseys: parseFloat(result.pointsJerseys as string),
      kom: parseFloat(result.pointsKom as string),
      sprint: parseFloat(result.pointsSprint as string),
      combative: parseFloat(result.pointsCombative as string),
      penalty: parseFloat(result.pointsPenalty as string),
    },
  }));

  res.json({ stage: formatStage(stage), results });
});

export default router;
