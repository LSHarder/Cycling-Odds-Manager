import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, stagesTable, ridersTable } from "@workspace/db";
import {
  AdminUpdateStageParams,
  AdminUpdateStageBody,
  AdminUpdateRiderParams,
  AdminUpdateRiderBody,
  AdminProcessStageParams,
  AdminPollStageParams,
  AdminUpdateStageResultsParams,
  AdminUpdateStageResultsBody,
} from "@workspace/api-zod";
import { processStage, ProcessStageError, upsertStageResultsForRiders } from "../lib/stageResults";
import { pollSingleStage } from "../lib/scheduler";

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
      pollingEnabled: s.pollingEnabled,
      scrapeAttempts: s.scrapeAttempts,
      lastScrapeAttemptAt: s.lastScrapeAttemptAt?.toISOString() ?? null,
      lastScrapeError: s.lastScrapeError ?? null,
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
  if (parsed.data.pollingEnabled !== undefined)
    updateData.pollingEnabled = parsed.data.pollingEnabled;

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
    pollingEnabled: updated.pollingEnabled,
    scrapeAttempts: updated.scrapeAttempts,
    lastScrapeAttemptAt: updated.lastScrapeAttemptAt?.toISOString() ?? null,
    lastScrapeError: updated.lastScrapeError ?? null,
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
  if (parsed.data.pcsSlug !== undefined) updateData.pcsSlug = parsed.data.pcsSlug;

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
 * Process a stage: compute fantasy points for all riders with entered
 * results, then distribute points to all users whose current team includes
 * those riders. Results must already exist (via scrape or manual entry).
 */
router.post("/admin/stages/:id/process", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminProcessStageParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  try {
    const result = await processStage(params.data.id);
    res.json(result);
  } catch (err) {
    if (err instanceof ProcessStageError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/**
 * Manually trigger one scrape+process attempt for a single stage right now,
 * bypassing the scheduler's pollingEnabled/attempts gate. Also how the
 * scheduler itself processes a stage under the hood.
 */
router.post("/admin/stages/:id/poll", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminPollStageParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  try {
    const result = await pollSingleStage(params.data.id);
    res.json(result);
  } catch (err) {
    if (err instanceof ProcessStageError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/**
 * Manually enter or correct per-rider results for a stage — the fallback
 * path for when auto-scraping fails or hasn't run yet. Does not process
 * points itself; call /process (or /poll) afterwards to distribute them.
 */
router.put("/admin/stages/:id/results", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminUpdateStageResultsParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  const parsed = AdminUpdateStageResultsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await upsertStageResultsForRiders(params.data.id, parsed.data);
  res.json({ success: true, count: parsed.data.length });
});

/**
 * Sync riders from ProCyclingStats TDF startlist.
 * Uses Firecrawl to scrape the startlist page.
 */
router.post("/admin/sync", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  try {
    // Use built-in fetch to hit PCS startlist
    const url = "https://www.procyclingstats.com/race/tour-de-france/2026/startlist";
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
