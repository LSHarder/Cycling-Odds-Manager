import { Router, type IRouter } from "express";
import { eq, inArray, and } from "drizzle-orm";
import { db, ridersTable, stagesTable, userTeamRidersTable } from "@workspace/db";
import { UpdateMyTeamBody } from "@workspace/api-zod";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

async function isTransferWindowOpen(): Promise<boolean> {
  const stages = await db
    .select()
    .from(stagesTable)
    .orderBy(asc(stagesTable.stageNumber));

  const current = stages.find(
    (s) => s.status === "upcoming" || s.status === "transfer_closed" || s.status === "live"
  );

  if (!current) return false;
  if (current.status !== "upcoming") return false;
  const deadline = current.transferDeadline ? new Date(current.transferDeadline) : null;
  if (!deadline) return true; // no deadline set = window open
  return new Date() < deadline;
}

function formatRiderSummary(r: typeof ridersTable.$inferSelect, isCaptain: boolean) {
  return {
    id: r.id,
    name: r.name,
    proTeam: r.proTeam,
    oddsDecimal: parseFloat(r.oddsDecimal as string),
    oddsLabel: r.oddsLabel,
    photoUrl: r.photoUrl ?? null,
    currentJerseys: r.currentJerseys ?? [],
    dnf: r.dnf,
    isCaptain,
  };
}

router.get("/team", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const teamRows = await db
    .select()
    .from(userTeamRidersTable)
    .where(eq(userTeamRidersTable.userId, req.user.id));

  const riderIds = teamRows.map((r) => r.riderId);
  const riders = riderIds.length > 0
    ? await db.select().from(ridersTable).where(inArray(ridersTable.id, riderIds))
    : [];

  const captainRow = teamRows.find((r) => r.isCaptain);
  const captainRiderId = captainRow?.riderId ?? null;

  const windowOpen = await isTransferWindowOpen();

  res.json({
    riders: riders.map((r) => {
      const row = teamRows.find((tr) => tr.riderId === r.id);
      return formatRiderSummary(r, row?.isCaptain ?? false);
    }),
    captainRiderId,
    transferWindowOpen: windowOpen,
    totalPoints: 0, // computed via /points/me
  });
});

router.put("/team", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const windowOpen = await isTransferWindowOpen();
  if (!windowOpen) {
    res.status(400).json({ error: "Transfer window is closed" });
    return;
  }

  const parsed = UpdateMyTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { riderIds, captainRiderId } = parsed.data;

  if (!riderIds.includes(captainRiderId)) {
    res.status(400).json({ error: "Captain must be one of your selected riders" });
    return;
  }

  // Verify all riders exist and are active
  const riders = await db
    .select()
    .from(ridersTable)
    .where(inArray(ridersTable.id, riderIds));

  if (riders.length !== riderIds.length) {
    res.status(400).json({ error: "One or more riders not found" });
    return;
  }

  const inactiveOrDnf = riders.filter((r) => !r.isActive || r.dnf);
  if (inactiveOrDnf.length > 0) {
    res.status(400).json({
      error: `Riders not available: ${inactiveOrDnf.map((r) => r.name).join(", ")}`,
    });
    return;
  }

  // Replace entire team
  await db
    .delete(userTeamRidersTable)
    .where(eq(userTeamRidersTable.userId, req.user.id));

  if (riderIds.length > 0) {
    await db.insert(userTeamRidersTable).values(
      riderIds.map((riderId) => ({
        userId: req.user.id,
        riderId,
        isCaptain: riderId === captainRiderId,
      }))
    );
  }

  // Return updated team
  const teamRows = await db
    .select()
    .from(userTeamRidersTable)
    .where(eq(userTeamRidersTable.userId, req.user.id));

  res.json({
    riders: riders.map((r) => {
      const row = teamRows.find((tr) => tr.riderId === r.id);
      return formatRiderSummary(r, row?.isCaptain ?? false);
    }),
    captainRiderId,
    transferWindowOpen: true,
    totalPoints: 0,
  });
});

export default router;
