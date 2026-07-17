import { Router, type IRouter } from "express";
import { eq, ilike, and } from "drizzle-orm";
import { db, ridersTable } from "@workspace/db";
import { GetRiderParams, ListRidersQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function formatRider(r: typeof ridersTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    proTeam: r.proTeam,
    nationality: r.nationality,
    oddsDecimal: parseFloat(r.oddsDecimal as string),
    oddsLabel: r.oddsLabel,
    photoUrl: r.photoUrl ?? null,
    isActive: r.isActive,
    dnf: r.dnf,
    currentJerseys: r.currentJerseys ?? [],
    pcsSlug: r.pcsSlug ?? null,
  };
}

router.get("/riders", async (req, res): Promise<void> => {
  const parsed = ListRidersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, team } = parsed.data;
  const conditions = [];

  if (search) {
    conditions.push(ilike(ridersTable.name, `%${search}%`));
  }
  if (team) {
    conditions.push(ilike(ridersTable.proTeam, `%${team}%`));
  }

  const riders = await db
    .select()
    .from(ridersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(ridersTable.oddsDecimal, ridersTable.name);

  res.json(riders.map(formatRider));
});

router.get("/riders/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRiderParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid rider ID" });
    return;
  }

  const [rider] = await db
    .select()
    .from(ridersTable)
    .where(eq(ridersTable.id, params.data.id));

  if (!rider) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }

  res.json(formatRider(rider));
});

export default router;
