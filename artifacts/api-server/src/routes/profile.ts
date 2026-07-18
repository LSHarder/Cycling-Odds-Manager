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

  // Read from the DB so we always return the latest teamName and isAdmin,
  // not the stale snapshot stored in the session at login time.
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: dbUser.id,
    replitId: dbUser.id,
    email: dbUser.email ?? null,
    firstName: dbUser.firstName ?? null,
    teamName: dbUser.teamName ?? null,
    profileImageUrl: dbUser.profileImageUrl ?? null,
    isAdmin: dbUser.isAdmin ?? false,
    createdAt: dbUser.createdAt ? new Date(dbUser.createdAt).toISOString() : null,
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
