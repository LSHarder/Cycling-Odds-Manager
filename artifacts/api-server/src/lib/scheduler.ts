import { and, eq, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { db, stagesTable, type Stage } from "@workspace/db";
import { scrapeStageResults, StageNotReadyError } from "./pcsScraper";
import { applyScrapedResults, processStage, ProcessStageError } from "./stageResults";
import { logger } from "./logger";

export const DEFAULT_POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
export const MAX_SCRAPE_ATTEMPTS = 15;

export interface AttemptStageResult {
  scraped: boolean;
  processed: boolean;
  ridersMatched?: number;
  ridersUnmatched?: string[];
  error?: string;
}

async function recordAttempt(stageId: number, error: string | null): Promise<void> {
  await db
    .update(stagesTable)
    .set({
      scrapeAttempts: sql`${stagesTable.scrapeAttempts} + 1`,
      lastScrapeAttemptAt: new Date(),
      lastScrapeError: error,
    })
    .where(eq(stagesTable.id, stageId));
}

/**
 * Scrapes + processes a single stage. Used by both the periodic sweep
 * (pollAndProcessStages) and the manual "poll now" admin endpoint.
 */
export async function attemptStage(stage: Stage): Promise<AttemptStageResult> {
  if (!stage.pcsUrl) {
    const error = "No pcsUrl set for this stage";
    await recordAttempt(stage.id, error);
    return { scraped: false, processed: false, error };
  }

  try {
    const scraped = await scrapeStageResults(stage.pcsUrl);
    const summary = await applyScrapedResults(stage.id, scraped);

    if (stage.status === "upcoming" || stage.status === "transfer_closed") {
      await db.update(stagesTable).set({ status: "live" }).where(eq(stagesTable.id, stage.id));
    }

    await processStage(stage.id);
    await recordAttempt(stage.id, null);

    return {
      scraped: true,
      processed: true,
      ridersMatched: summary.ridersMatched,
      ridersUnmatched: summary.ridersUnmatched,
    };
  } catch (err) {
    if (err instanceof StageNotReadyError) {
      // Not an error — the stage just hasn't finished yet. No message stored.
      await recordAttempt(stage.id, null);
      return { scraped: false, processed: false };
    }
    const message = err instanceof Error ? err.message : String(err);
    await recordAttempt(stage.id, message);
    logger.warn({ stageId: stage.id, err }, "Stage auto-scrape/process failed");
    return { scraped: false, processed: false, error: message };
  }
}

/** Manual trigger for a single stage — bypasses the pollingEnabled/attempts gate. */
export async function pollSingleStage(stageId: number): Promise<AttemptStageResult> {
  const [stage] = await db.select().from(stagesTable).where(eq(stagesTable.id, stageId));
  if (!stage) throw new ProcessStageError(404, "Stage not found");
  if (stage.resultsProcessed) throw new ProcessStageError(400, "Stage already processed");
  return attemptStage(stage);
}

let isPolling = false;

/** Finds stages that are due for auto-processing and attempts each one. */
export async function pollAndProcessStages(): Promise<void> {
  if (isPolling) return; // avoid overlapping sweeps if one run takes longer than the interval
  isPolling = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dueStages = await db
      .select()
      .from(stagesTable)
      .where(
        and(
          ne(stagesTable.status, "completed"),
          eq(stagesTable.resultsProcessed, false),
          eq(stagesTable.pollingEnabled, true),
          lt(stagesTable.scrapeAttempts, MAX_SCRAPE_ATTEMPTS),
          lte(stagesTable.date, today),
          isNotNull(stagesTable.pcsUrl),
        ),
      );

    for (const stage of dueStages) {
      await attemptStage(stage);
    }
  } finally {
    isPolling = false;
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startScheduler(
  intervalMs: number = Number(process.env.SCRAPE_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS,
): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    pollAndProcessStages().catch((err) => logger.error({ err }, "Scheduler tick failed"));
  }, intervalMs);
  logger.info({ intervalMs }, "Stage auto-scrape scheduler started");
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
