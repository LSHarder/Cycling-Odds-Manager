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
  AdminScrapeFromHtmlParams,
  AdminScrapeFromHtmlBody,
} from "@workspace/api-zod";
import { processStage, ProcessStageError, upsertStageResultsForRiders, applyScrapedResults } from "../lib/stageResults";
import { pollSingleStage, catchUpDueStages } from "../lib/scheduler";
import { scrapeStartlist, parseStageResultsFromHtml, StageNotReadyError } from "../lib/pcsScraper";

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
      startTime: s.startTime?.toISOString() ?? null,
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
  if (parsed.data.startTime !== undefined) {
    updateData.startTime = new Date(parsed.data.startTime);
    // Manual startTime recomputes transferDeadline too, unless the caller
    // also gave an explicit deadline in the same request.
    if (parsed.data.transferDeadline === undefined) {
      updateData.transferDeadline = new Date(
        updateData.startTime.getTime() - 30 * 60 * 1000,
      );
    }
  }
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
    startTime: updated.startTime?.toISOString() ?? null,
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
 * Processes every currently-due stage right now, bypassing the scheduler's
 * daily time window (but not pollingEnabled/attempts). For catching up a
 * backlog immediately — e.g. the app was just set up mid-Tour, or was
 * offline for a few days — instead of waiting for the next scheduled window.
 */
router.post("/admin/stages/catch-up", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const result = await catchUpDueStages();
  res.json(result);
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
 * Parses stage results (and optionally the combative-rider award) from HTML
 * pasted in directly, instead of fetching it server-side — the fallback for
 * when PCS has blocked this server's own outbound requests outright (a real
 * 403 from curl itself, not just Node's fetch, and not fixable by changing
 * headers). An admin's own browser isn't on that block list, so they can
 * open the page normally, copy its source, and paste it here. Same
 * riders-matched/points-distribution pipeline as the live scraper — just
 * doesn't process points itself, same as manual entry (call /process after).
 */
router.post("/admin/stages/:id/scrape-from-html", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminScrapeFromHtmlParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid stage ID" });
    return;
  }

  const parsed = AdminScrapeFromHtmlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let scraped;
  try {
    scraped = parseStageResultsFromHtml(parsed.data.html, parsed.data.complementaryHtml);
  } catch (err) {
    if (err instanceof StageNotReadyError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(400).json({
      error: err instanceof Error ? err.message : "Could not parse the pasted HTML",
    });
    return;
  }

  const summary = await applyScrapedResults(params.data.id, scraped);
  res.json({
    success: true,
    ridersMatched: summary.ridersMatched,
    ridersUnmatched: summary.ridersUnmatched,
  });
});

/**
 * Sync riders from the ProCyclingStats TDF startlist: adds anyone new
 * (e.g. a late-named replacement for a withdrawn rider) and updates
 * proTeam/nationality for existing riders (e.g. a mid-season transfer).
 * Matched by pcsSlug, same as the one-time initial seed script this
 * doubles as a re-runnable counterpart to. Odds are never touched here —
 * those are set independently via the admin rider-edit endpoint.
 */
router.post("/admin/sync", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  let scraped: Awaited<ReturnType<typeof scrapeStartlist>>;
  try {
    scraped = await scrapeStartlist(2026);
  } catch (err) {
    req.log.error({ err }, "Failed to sync from PCS");
    res.json({
      success: false,
      ridersFound: 0,
      message: "Failed to reach ProCyclingStats. Please update riders manually.",
    });
    return;
  }

  const existing = await db
    .select({ id: ridersTable.id, pcsSlug: ridersTable.pcsSlug, proTeam: ridersTable.proTeam, nationality: ridersTable.nationality })
    .from(ridersTable);
  const bySlug = new Map(existing.filter((r) => r.pcsSlug).map((r) => [r.pcsSlug as string, r]));

  const newRiders = scraped.filter((r) => !bySlug.has(r.pcsSlug));
  if (newRiders.length > 0) {
    await db.insert(ridersTable).values(newRiders);
  }

  const changed = scraped.filter((r) => {
    const current = bySlug.get(r.pcsSlug);
    return current && (current.proTeam !== r.proTeam || current.nationality !== r.nationality);
  });
  await Promise.all(
    changed.map((r) =>
      db
        .update(ridersTable)
        .set({ proTeam: r.proTeam, nationality: r.nationality })
        .where(eq(ridersTable.pcsSlug, r.pcsSlug)),
    ),
  );

  res.json({
    success: true,
    ridersFound: scraped.length,
    message: `Found ${scraped.length} riders on PCS: added ${newRiders.length} new, updated ${changed.length} existing.`,
  });
});

export default router;
