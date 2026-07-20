import { and, eq, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db, stagesTable, type Stage } from "@workspace/db";
import { scrapeStageResults, scrapeStageStartTimeText, StageNotReadyError } from "./pcsScraper";
import { applyScrapedResults, processStage, ProcessStageError } from "./stageResults";
import { logger } from "./logger";
import { getWallClockTime, localWallClockToUtc } from "./timezone";

// How often the scheduler ticks. Cheap on every tick (mostly DB-only checks
// plus an occasional low-volume startTime backfill); the result-scraping
// sweep below only actually fires within its daily window.
export const DEFAULT_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_SCRAPE_ATTEMPTS = 15;

// Tour stages are virtually always finished well before this local time, so
// checking once in the evening (with a short retry allowance in case a
// stage is delayed) means results are almost always there on the first try
// — a small handful of requests per stage instead of dozens.
const DAILY_CHECK_TIMEZONE = "Europe/Copenhagen";
const DAILY_CHECK_HOUR = 19;
const DAILY_CHECK_WINDOW_MINUTES = 120;

// PCS's stage time-table shows local race time; the Tour runs in France
// (Europe/Paris) for virtually all of its route, so that's used to convert
// the scraped "Start HH:MM" into a real UTC timestamp.
const RACE_LOCAL_TIMEZONE = "Europe/Paris";

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
 * Scrapes + processes a single stage. Used by both the daily sweep
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

/**
 * Backfills startTime (and the transferDeadline derived from it) for any
 * stage that has a pcsUrl but no startTime yet. Cheap and time-insensitive —
 * PCS publishes route/schedule info days or weeks ahead of race day, so this
 * runs on every tick regardless of the daily results-check window.
 */
async function backfillStartTimes(): Promise<void> {
  const candidates = await db
    .select()
    .from(stagesTable)
    .where(
      and(
        isNull(stagesTable.startTime),
        isNotNull(stagesTable.pcsUrl),
        ne(stagesTable.status, "completed"),
      ),
    );

  for (const stage of candidates) {
    const timeText = await scrapeStageStartTimeText(stage.pcsUrl!);
    if (!timeText) continue; // not published yet — try again next tick

    const startTime = localWallClockToUtc(stage.date, timeText, RACE_LOCAL_TIMEZONE);
    const transferDeadline = new Date(startTime.getTime() - 30 * 60 * 1000);
    await db
      .update(stagesTable)
      .set({ startTime, transferDeadline })
      .where(eq(stagesTable.id, stage.id));
  }
}

function isWithinDailyCheckWindow(now: Date): boolean {
  const { hour, minute } = getWallClockTime(now, DAILY_CHECK_TIMEZONE);
  const minutesSinceMidnight = hour * 60 + minute;
  const windowStart = DAILY_CHECK_HOUR * 60;
  const windowEnd = windowStart + DAILY_CHECK_WINDOW_MINUTES;
  return minutesSinceMidnight >= windowStart && minutesSinceMidnight < windowEnd;
}

async function findDueStages(): Promise<Stage[]> {
  const today = new Date().toISOString().slice(0, 10);
  return db
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
}

let isPolling = false;

/**
 * Backfills start times every tick, then — only within the daily
 * 19:00-21:00 Europe/Copenhagen window — scrapes+processes any stage that's
 * due. Outside that window this is just the (cheap) startTime backfill.
 */
export async function pollAndProcessStages(): Promise<void> {
  if (isPolling) return; // avoid overlapping sweeps if one run takes longer than the interval
  isPolling = true;
  try {
    await backfillStartTimes();

    if (!isWithinDailyCheckWindow(new Date())) return;

    for (const stage of await findDueStages()) {
      await attemptStage(stage);
    }
  } finally {
    isPolling = false;
  }
}

export interface CatchUpResult {
  attempted: number;
  processed: number;
  results: Array<{ stageId: number; stageNumber: number } & AttemptStageResult>;
}

/**
 * Manual catch-up: processes every currently-due stage right now, bypassing
 * the daily time window (but still respecting pollingEnabled/attempts, same
 * as the scheduler). For when the app was offline or freshly set up mid-Tour
 * and has a backlog of already-finished stages to work through immediately
 * instead of waiting for the next scheduled window.
 */
export async function catchUpDueStages(): Promise<CatchUpResult> {
  const dueStages = await findDueStages();
  const results: CatchUpResult["results"] = [];
  for (const stage of dueStages) {
    const result = await attemptStage(stage);
    results.push({ stageId: stage.id, stageNumber: stage.stageNumber, ...result });
  }
  return {
    attempted: results.length,
    processed: results.filter((r) => r.processed).length,
    results,
  };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startScheduler(
  intervalMs: number = Number(process.env.SCRAPE_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS,
): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    pollAndProcessStages().catch((err) => logger.error({ err }, "Scheduler tick failed"));
  }, intervalMs);
  logger.info(
    { intervalMs, dailyCheckHour: DAILY_CHECK_HOUR, timezone: DAILY_CHECK_TIMEZONE },
    "Stage auto-scrape scheduler started",
  );
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
