/**
 * One-time seed: pulls the real Tour de France roster + stage list from
 * procyclingstats.com and inserts them into the DB. Safe to re-run — skips
 * riders/stages that already exist (by pcsSlug / stageNumber).
 *
 * Usage: pnpm --filter @workspace/scripts run seed [year]
 * (year defaults to 2026)
 *
 * Selectors verified against real, live PCS pages during development —
 * see comments below for what was checked.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as cheerio from "cheerio";
import { db, ridersTable, stagesTable } from "@workspace/db";

const execFileAsync = promisify(execFile);
const USER_AGENT = "Mozilla/5.0 (compatible; CyclingFantasy/1.0; +https://cycling-fantasy.repl.co)";

// Node's fetch gets 403'd by PCS's bot detection even with full browser
// headers (verified empirically); curl from the same machine doesn't.
async function fetchHtml(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "curl",
    ["--silent", "--show-error", "--fail", "--max-time", "20", "--location", "-A", USER_AGENT, url],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout;
}

function extractSlug(href: string | undefined): string | null {
  if (!href) return null;
  const match = href.match(/^rider\/(.+)$/);
  return match && match[1] ? match[1] : null;
}

// PCS writes rider names as "SURNAME Given" (surname in caps). Reformats to
// "Given Surname" — best-effort, not guaranteed perfect for every name.
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

interface SeededRider {
  name: string;
  proTeam: string;
  nationality: string;
  pcsSlug: string;
}

async function scrapeRiders(year: number): Promise<SeededRider[]> {
  const html = await fetchHtml(`https://www.procyclingstats.com/race/tour-de-france/${year}/startlist`);
  const $ = cheerio.load(html);
  const riders: SeededRider[] = [];

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

type StageType = "flat" | "hilly" | "mountain" | "time_trial" | "rest";

const PROFILE_TO_TYPE: Record<string, StageType> = {
  p1: "flat",
  p2: "hilly",
  p3: "hilly",
  p4: "mountain",
  p5: "mountain",
};

interface SeededStage {
  stageNumber: number;
  name: string;
  startCity: string;
  endCity: string;
  date: string;
  stageType: StageType;
  pcsUrl: string;
}

async function scrapeStages(year: number): Promise<SeededStage[]> {
  const html = await fetchHtml(`https://www.procyclingstats.com/race/tour-de-france/${year}/route`);
  const $ = cheerio.load(html);
  const stages: SeededStage[] = [];

  const table = $("h4")
    .filter((_, el) => $(el).text().trim() === "Stages")
    .first()
    .next("table.basic");

  table.find("tbody > tr").each((_, row) => {
    const cells = $(row).find("> td");
    if (cells.length < 7) return;

    const link = $(cells.get(2)).find("a[href*='/stage-']").first();
    const href = link.attr("href");
    const stageMatch = href?.match(/\/stage-(\d+)$/);
    if (!stageMatch) return; // skips the totals row, which has no stage link

    const stageNumber = parseInt(stageMatch[1], 10);
    const label = link.text();
    const dateText = $(cells.get(0)).text().trim(); // "DD/MM"
    const [day, month] = dateText.split("/");
    if (!day || !month) return;
    const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    const profileClass = $(cells.get(1))
      .find("span.icon.profile")
      .attr("class")
      ?.split(/\s+/)
      .find((c) => /^p\d$/.test(c));
    const isTimeTrial = /\(ITT\)|\(TTT\)/.test(label);
    const stageType: StageType = isTimeTrial
      ? "time_trial"
      : (profileClass && PROFILE_TO_TYPE[profileClass]) || "flat";

    const startCity = $(cells.get(3)).text().trim();
    const endCity = $(cells.get(4)).text().trim();

    stages.push({
      stageNumber,
      name: `${startCity} → ${endCity}`,
      startCity,
      endCity,
      date,
      stageType,
      pcsUrl: `https://www.procyclingstats.com/race/tour-de-france/${year}/stage-${stageNumber}`,
    });
  });

  return stages;
}

async function main() {
  const year = Number(process.argv[2]) || 2026;
  console.log(`Seeding Tour de France ${year} riders + stages from PCS...`);

  const [riders, stages] = await Promise.all([scrapeRiders(year), scrapeStages(year)]);
  console.log(`Scraped ${riders.length} riders and ${stages.length} stages.`);

  const existingRiderSlugs = new Set(
    (await db.select({ pcsSlug: ridersTable.pcsSlug }).from(ridersTable)).map((r) => r.pcsSlug),
  );
  const newRiders = riders.filter((r) => !existingRiderSlugs.has(r.pcsSlug));
  if (newRiders.length > 0) {
    await db.insert(ridersTable).values(newRiders);
  }
  console.log(`Inserted ${newRiders.length} new riders (${riders.length - newRiders.length} already existed).`);

  const existingStageNumbers = new Set(
    (await db.select({ stageNumber: stagesTable.stageNumber }).from(stagesTable)).map((s) => s.stageNumber),
  );
  const newStages = stages.filter((s) => !existingStageNumbers.has(s.stageNumber));
  if (newStages.length > 0) {
    await db.insert(stagesTable).values(newStages);
  }
  console.log(`Inserted ${newStages.length} new stages (${stages.length - newStages.length} already existed).`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
