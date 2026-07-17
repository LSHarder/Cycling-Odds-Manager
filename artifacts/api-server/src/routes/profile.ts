import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { UpdateProfileBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = req.user;
  res.json({
    id: user.id,
    replitId: user.id,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    teamName: user.teamName ?? null,
    profileImageUrl: user.profileImageUrl ?? null,
    isAdmin: user.isAdmin ?? false,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
  });
});

router.put("/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ teamName: parsed.data.teamName })
    .where(eq(usersTable.id, req.user.id))
    .returning();

  res.json({
    id: updated.id,
    replitId: updated.id,
    email: updated.email ?? null,
    firstName: updated.firstName ?? null,
    teamName: updated.teamName ?? null,
    profileImageUrl: updated.profileImageUrl ?? null,
    isAdmin: updated.isAdmin ?? false,
    createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : null,
  });
});

export default router;
