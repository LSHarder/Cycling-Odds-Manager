/**
 * Scraper for procyclingstats.com stage-result pages.
 *
 * PCS has no public API, so this parses their HTML directly. Selectors below
 * were verified against real pages — including a live 2026 Tour team time
 * trial, which caught a real bug (see below) — rather than guessed:
 *
 * - Each result tab (STAGE/GC/POINTS/KOM/YOUTH/TEAMS) is a `.resTab` div
 *   under `#resultsCont`, matched to its tab button via a shared `data-id`.
 *   POINTS=5 and KOM=7 are stable `data-stagetype` codes, but the STAGE
 *   tab's own code varies by format (1 for a normal road stage, 3 for a team
 *   time trial — confirmed against the real 2026 Tour's stage 1 TTT), so
 *   it's matched via the nav's `class="cur"` marker instead, which reliably
 *   points at the STAGE tab when loading a stage's base URL directly.
 * - Each tab's primary table (`.general table.results`) has `<thead><th
 *   data-code="...">` columns whose order isn't fixed across stage types
 *   (e.g. time trials drop some columns) — so columns are read by
 *   `data-code`, not position.
 * - DNF/DNS/OTL/DF/NR appear as literal text in the `rnk` cell instead of a
 *   number (per the page's own legend). We collapse all of these to a single
 *   `dnf: true` since our schema doesn't distinguish them.
 * - The POINTS and KOM tabs' `.general` tables include a `delta_pnt` column
 *   labeled "Today" — this is points gained on *this* stage specifically,
 *   which is exactly what `komPointsEarned`/`sprintPointsEarned` need (not
 *   the cumulative classification total). Riders absent from these tables
 *   scored 0 that day.
 * - Jersey holders live in a `<h4>Jersey wearers during stage</h4>` block
 *   followed by a `<ul class="list">` of one `<li>` per classification
 *   (General→yellow, Points→green, Mountains→polkadot, Youth→white).
 *
 * - The "most combative rider" award isn't on the main results page at all —
 *   it lives on a separate `/info/complementary-results` page, as a
 *   `<h3>Most combative rider</h3>` heading immediately followed by a
 *   `table.basic` with one ranked row (verified against three real, live
 *   2026 Tour road stages). Team time trials have no such heading — there's
 *   no attacking to reward on a team-only day — confirmed against the same
 *   Tour's stage 1 TTT, where the page loads fine but the heading is simply
 *   absent, which is treated as "no award today," not an error.
 *
 * - Team time trials render the STAGE tab as `.general ul.list.ttt-results`
 *   instead of the usual `table.results` (confirmed against the real 2026
 *   Tour's stage 1 TTT). Each `<li>` is one team: a rank in `.w10.fs14` and
 *   a nested `<table>` of that team's riders. All riders on a team share the
 *   team's rank as their stage position — there's no per-rider place across
 *   the whole field in a TTT. Riders who lose contact do show a per-rider
 *   time gap inside the team's table, but no real DNF/DNS example turned up
 *   in this format to verify against, so — like the standard-table path —
 *   only riders actually listed are captured.
 *
 * Fetching note: PCS's edge (Cloudflare-style bot detection) returns 403 to
 * requests made with Node's built-in `fetch`/undici even with a full set of
 * browser-like headers and a legit UA string — this was verified empirically
 * (identical headers, same source IP: `curl` gets 200, Node `fetch` gets
 * 403), which points to TLS/HTTP client fingerprinting rather than anything
 * header-based. `curl` is shelled out to for the actual request as a result;
 * it's a standard package on the target deploy environment (Replit's Nix
 * images), and cheerio still does all the parsing.
 */
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const USER_AGENT =
  "Mozilla/5.0 (compatible; CyclingFantasy/1.0; +https://cycling-fantasy.repl.co)";

async function fetchHtml(url: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["--silent", "--show-error", "--fail", "--max-time", "20", "--location", "--max-redirs", "3", "-A", USER_AGENT, url],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch (err: any) {
    const stderr = err?.stderr?.toString().trim();
    throw new Error(`Failed to fetch ${url}${stderr ? `: ${stderr}` : ""}`);
  }
}

// Below this many parsed rows, treat the page as "stage not finished yet"
// rather than a real result set (a full TDF field is 150+ riders).
export const MIN_FINISHER_ROWS = 30;

export type JerseyKey = "yellow" | "green" | "polkadot" | "white";

export interface ScrapedRiderResult {
  pcsSlug: string;
  name: string;
  position: number | null;
  dnf: boolean;
}

export interface ScrapedStageResults {
  riders: ScrapedRiderResult[];
  jerseys: Partial<Record<JerseyKey, string>>;
  komPointsBySlug: Map<string, number>;
  sprintPointsBySlug: Map<string, number>;
  combativeRiderSlug: string | null;
}

export class StageNotReadyError extends Error {}

const JERSEY_LABELS: Record<string, JerseyKey> = {
  General: "yellow",
  Points: "green",
  Mountains: "polkadot",
  Youth: "white",
};

function extractSlug(href: string | undefined): string | null {
  if (!href) return null;
  const match = href.match(/^rider\/(.+)$/);
  return match && match[1] ? match[1] : null;
}

function findResTabByStageType(
  $: cheerio.CheerioAPI,
  stageType: string,
): ReturnType<cheerio.CheerioAPI> | null {
  const tabId = $(`a.selectResultTab[data-stagetype="${stageType}"]`).attr("data-id");
  if (!tabId) return null;
  const resTab = $(`#resultsCont > .resTab[data-id="${tabId}"]`);
  return resTab.length ? resTab : null;
}

// The STAGE tab's own data-stagetype code varies by format (1 for a normal
// road stage, 3 for a team time trial — verified against a real 2026 TTT
// opener) so it can't be matched by a fixed code like the others. The tab
// marked `class="cur"` in the nav is reliably the active one when loading a
// stage's base URL directly, which is always the STAGE tab.
function findActiveStageResTab($: cheerio.CheerioAPI): ReturnType<cheerio.CheerioAPI> | null {
  const tabId = $("ul.resultTabs li.cur a.selectResultTab").attr("data-id");
  if (!tabId) return null;
  const resTab = $(`#resultsCont > .resTab[data-id="${tabId}"]`);
  return resTab.length ? resTab : null;
}

function parseGeneralTable($: cheerio.CheerioAPI, resTab: ReturnType<cheerio.CheerioAPI>) {
  const table = resTab.find(".general table.results").first();
  const headerMap = new Map<string, number>();
  table.find("thead th").each((i, el) => {
    const code = $(el).attr("data-code");
    if (code) headerMap.set(code, i);
  });
  const rows = table
    .find("tbody > tr")
    .toArray()
    .map((el) => $(el));
  return { headerMap, rows };
}

function parseDeltaPntTable(
  $: cheerio.CheerioAPI,
  resTab: ReturnType<cheerio.CheerioAPI> | null,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!resTab) return result;
  const { headerMap, rows } = parseGeneralTable($, resTab);
  const riderNameIdx = headerMap.get("ridername");
  const deltaIdx = headerMap.get("delta_pnt");
  if (riderNameIdx === undefined || deltaIdx === undefined) return result;
  for (const row of rows) {
    const cells = row.find("> td");
    const slug = extractSlug(
      $(cells.get(riderNameIdx)).find("a[href^='rider/']").first().attr("href"),
    );
    if (!slug) continue;
    const value = parseInt($(cells.get(deltaIdx)).text().trim(), 10);
    result.set(slug, Number.isFinite(value) ? value : 0);
  }
  return result;
}

// Team time trials list results as one <li> per team (rank + a nested table
// of that team's riders) rather than the usual one-row-per-rider table. Every
// rider on a team is credited with the team's rank as their stage position.
function parseTttResults(
  $: cheerio.CheerioAPI,
  resTab: ReturnType<cheerio.CheerioAPI>,
): ScrapedRiderResult[] {
  const riders: ScrapedRiderResult[] = [];
  const teamItems = resTab.find(".general ul.list.ttt-results > li").toArray();
  for (const li of teamItems) {
    const $li = $(li);
    const rankText = $li.find(".w10.fs14").first().text().trim();
    if (!/^\d+$/.test(rankText)) continue; // header row, not a team row
    const rank = parseInt(rankText, 10);
    $li.find("table tr").each((_, tr) => {
      const riderLink = $(tr).find("a[href^='rider/']").first();
      const slug = extractSlug(riderLink.attr("href"));
      if (!slug) return;
      riders.push({ pcsSlug: slug, name: riderLink.text().trim(), position: rank, dnf: false });
    });
  }
  return riders;
}

function isTttResultsTab(resTab: ReturnType<cheerio.CheerioAPI>): boolean {
  return resTab.find(".general ul.list.ttt-results").length > 0;
}

function parseJerseys($: cheerio.CheerioAPI): Partial<Record<JerseyKey, string>> {
  const jerseys: Partial<Record<JerseyKey, string>> = {};
  const heading = $("h4")
    .filter((_, el) => $(el).text().trim() === "Jersey wearers during stage")
    .first();
  const list = heading.next("ul.list");
  list.find("li").each((_, li) => {
    const label = $(li).find(".w22").first().text().trim();
    const key = JERSEY_LABELS[label];
    if (!key) return;
    const slug = extractSlug($(li).find("a[href^='rider/']").first().attr("href"));
    if (slug) jerseys[key] = slug;
  });
  return jerseys;
}

// Parses everything on the main stage-results page (riders, jerseys, KOM,
// sprint) — the part shared between fetching a live URL and parsing HTML
// pasted in by hand (see parseStageResultsFromHtml below, added when PCS
// started 403-ing Replit's own outbound IP entirely, blocking the curl path
// regardless of User-Agent — a user's own browser isn't on that block list).
function parseStageResultsDocument($: cheerio.CheerioAPI): Omit<ScrapedStageResults, "combativeRiderSlug"> {
  const stageTab = findActiveStageResTab($);
  if (!stageTab) {
    throw new Error("Could not locate the STAGE results tab — page structure may have changed");
  }

  let riders: ScrapedRiderResult[];
  if (isTttResultsTab(stageTab)) {
    riders = parseTttResults($, stageTab);
  } else {
    const { headerMap, rows } = parseGeneralTable($, stageTab);
    const rnkIdx = headerMap.get("rnk");
    const riderNameIdx = headerMap.get("ridername");
    if (rnkIdx === undefined || riderNameIdx === undefined) {
      throw new Error("Unexpected results table structure (missing rnk/ridername columns)");
    }

    riders = [];
    for (const row of rows) {
      const cells = row.find("> td");
      const rnkText = $(cells.get(rnkIdx)).text().trim();
      const rideCell = $(cells.get(riderNameIdx));
      const riderLink = rideCell.find("a[href^='rider/']").first();
      const slug = extractSlug(riderLink.attr("href"));
      if (!slug) continue;
      const position = /^\d+$/.test(rnkText) ? parseInt(rnkText, 10) : null;
      riders.push({
        pcsSlug: slug,
        name: riderLink.text().trim(),
        position,
        dnf: position === null,
      });
    }
  }

  if (riders.length < MIN_FINISHER_ROWS) {
    throw new StageNotReadyError(
      `Only found ${riders.length} results rows (need >= ${MIN_FINISHER_ROWS}); stage likely hasn't finished yet`,
    );
  }

  const komPointsBySlug = parseDeltaPntTable($, findResTabByStageType($, "7"));
  const sprintPointsBySlug = parseDeltaPntTable($, findResTabByStageType($, "5"));
  const jerseys = parseJerseys($);

  return { riders, jerseys, komPointsBySlug, sprintPointsBySlug };
}

// Parses the "Most combative rider" award from an already-fetched
// complementary-results page's HTML — see scrapeCombativeRider below for
// the page structure this expects.
function parseCombativeRiderDocument($: cheerio.CheerioAPI): string | null {
  const heading = $("h3")
    .filter((_, el) => $(el).text().trim() === "Most combative rider")
    .first();
  if (!heading.length) return null;
  const firstRow = heading.next("table.basic").find("tbody tr").first();
  return extractSlug(firstRow.find("a[href^='rider/']").first().attr("href"));
}

export async function scrapeStageResults(url: string): Promise<ScrapedStageResults> {
  const html = await fetchHtml(url);
  const parsed = parseStageResultsDocument(cheerio.load(html));
  const combativeRiderSlug = await scrapeCombativeRider(url);
  return { ...parsed, combativeRiderSlug };
}

/**
 * Same parsing as scrapeStageResults, but on HTML supplied directly instead
 * of fetched server-side — for when PCS has blocked this server's outbound
 * requests (curl gets a real 403 back, not just Node fetch's usual one) but
 * an admin's own browser can still load the page fine and paste its source.
 * complementaryHtml is the separate /info/complementary-results page's
 * source, for the combative-rider award; omit it to just skip that field
 * (null), same as scrapeCombativeRider already does when that page 404s.
 */
export function parseStageResultsFromHtml(
  html: string,
  complementaryHtml?: string | null,
): ScrapedStageResults {
  const parsed = parseStageResultsDocument(cheerio.load(html));
  const combativeRiderSlug = complementaryHtml
    ? parseCombativeRiderDocument(cheerio.load(complementaryHtml))
    : null;
  return { ...parsed, combativeRiderSlug };
}

/**
 * Scrapes the stage's "Most combative rider" award from PCS's separate
 * `/info/complementary-results` page — verified against three real, live
 * 2026 Tour road stages, each with a `<h3>Most combative rider</h3>` heading
 * immediately followed by a `table.basic` with one ranked row. A team time
 * trial (stage 1) loads this page fine but has no such heading at all —
 * there's no attacking to reward on a team-only day — so a missing heading
 * is treated as "no award today," not a failure.
 */
export async function scrapeCombativeRider(stagePcsUrl: string): Promise<string | null> {
  const url = `${stagePcsUrl.replace(/\/+$/, "")}/info/complementary-results`;
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return null;
  }
  return parseCombativeRiderDocument(cheerio.load(html));
}

/**
 * Scrapes a stage's official local start time (HH:MM) from PCS's per-stage
 * "time table" page. Verified against a real, currently-live 2026 Tour
 * stage: the page has a `table.basic` whose first `<tbody>` row is the
 * keypoint literally labeled "Start" at km 0, with the same HH:MM repeated
 * across all pace-estimate columns (they only diverge at later keypoints).
 * Route/schedule pages are published well ahead of race day, so this can
 * succeed days or weeks before the stage actually happens — unlike results.
 *
 * Returns null (not an error) if the page doesn't have this yet, since
 * "not published yet" is an expected, ordinary state, not a failure.
 */
export async function scrapeStageStartTimeText(stagePcsUrl: string): Promise<string | null> {
  const timeTableUrl = `${stagePcsUrl.replace(/\/+$/, "")}/info/time-table`;
  let html: string;
  try {
    html = await fetchHtml(timeTableUrl);
  } catch {
    return null;
  }
  const $ = cheerio.load(html);
  const firstRow = $("table.basic tbody tr").first();
  if (!firstRow.length) return null;

  const cells = firstRow.find("> td");
  const keypoint = $(cells.get(1)).text().trim();
  if (keypoint.toLowerCase() !== "start") return null;

  const timeText = $(cells.get(2)).text().trim();
  return /^\d{1,2}:\d{2}$/.test(timeText) ? timeText : null;
}

// PCS writes rider names as "SURNAME Given" (surname in caps). Reformats to
// "Given Surname" — best-effort, not guaranteed perfect for every name.
// (Mirrors scripts/src/seedFromPcs.ts, which verified this against the real
// startlist during the one-time initial seed.)
function formatRiderName(raw: string): string {
  const tokens = raw.trim().split(/\s+/);
  let splitIdx = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== tokens[i].toUpperCase() || !/[A-ZÀ-ÖØ-Þ]/.test(tokens[i])) {
      splitIdx = i;
      break;
    }
  }
  const surnameTokens = tokens.slice(0, splitIdx);
  const givenTokens = tokens.slice(splitIdx);
  if (surnameTokens.length === 0 || givenTokens.length === 0) return raw.trim();
  const toTitleCase = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();
  const surname = surnameTokens.map((t) => t.split("-").map(toTitleCase).join("-")).join(" ");
  return `${givenTokens.join(" ")} ${surname}`;
}

// Common WorldTour rider nationalities. Falls back to the raw ISO code
// (uppercased) for anything not listed here.
const COUNTRY_NAMES: Record<string, string> = {
  si: "Slovenia", dk: "Denmark", be: "Belgium", fr: "France", nl: "Netherlands",
  es: "Spain", it: "Italy", gb: "Great Britain", de: "Germany", pt: "Portugal",
  us: "United States", au: "Australia", ca: "Canada", co: "Colombia", ec: "Ecuador",
  no: "Norway", se: "Sweden", pl: "Poland", cz: "Czechia", sk: "Slovakia",
  at: "Austria", ch: "Switzerland", ie: "Ireland", lu: "Luxembourg", lv: "Latvia",
  lt: "Lithuania", ee: "Estonia", nz: "New Zealand", za: "South Africa", jp: "Japan",
  kr: "South Korea", uy: "Uruguay", ar: "Argentina", br: "Brazil", mx: "Mexico",
  kz: "Kazakhstan", er: "Eritrea", rw: "Rwanda", ru: "Russia", ua: "Ukraine",
  hu: "Hungary", fi: "Finland", is: "Iceland", cn: "China", hr: "Croatia",
};

export interface ScrapedStartlistRider {
  name: string;
  proTeam: string;
  nationality: string;
  pcsSlug: string;
}

/**
 * Scrapes the full TDF startlist (name, team, nationality per rider) from
 * PCS's `/startlist` page. Same selectors as the one-time initial seed
 * script, so this doubles as its "run again mid-Tour" counterpart — e.g. a
 * rider withdraws pre-race and their team names a replacement.
 */
export async function scrapeStartlist(year: number): Promise<ScrapedStartlistRider[]> {
  const html = await fetchHtml(`https://www.procyclingstats.com/race/tour-de-france/${year}/startlist`);
  const $ = cheerio.load(html);
  const riders: ScrapedStartlistRider[] = [];

  $("ul.startlist_v4 > li").each((_, teamLi) => {
    const teamName = $(teamLi)
      .find(".ridersCont a.team")
      .first()
      .text()
      .trim()
      .replace(/\s*\((WT|PRT|PCT)\)\s*$/, "");
    if (!teamName) return;

    $(teamLi)
      .find(".ridersCont ul li")
      .each((_, riderLi) => {
        const link = $(riderLi).find("a[href^='rider/']").first();
        const slug = extractSlug(link.attr("href"));
        if (!slug) return;
        const countryCode = $(riderLi).find("span.flag").first().attr("class")?.split(/\s+/)[1] ?? "";
        riders.push({
          name: formatRiderName(link.text()),
          proTeam: teamName,
          nationality: COUNTRY_NAMES[countryCode] ?? countryCode.toUpperCase(),
          pcsSlug: slug,
        });
      });
  });

  return riders;
}
