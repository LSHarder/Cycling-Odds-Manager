import { Router, type IRouter } from "express";
import { sql, eq, desc, sum } from "drizzle-orm";
import { db, userStagePointsTable, usersTable } from "@workspace/db";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res): Promise<void> => {
  const parsed = GetLeaderboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 50;
  const offset = parsed.data.offset ?? 0;

  // Aggregate total points per user
  const totals = await db
    .select({
      userId: userStagePointsTable.userId,
      totalPoints: sql<number>`COALESCE(SUM(${userStagePointsTable.totalPoints}), 0)::numeric`,
    })
    .from(userStagePointsTable)
    .groupBy(userStagePointsTable.userId)
    .orderBy(desc(sql`SUM(${userStagePointsTable.totalPoints})`))
    .limit(limit)
    .offset(offset);

  // Get user info for each
  const userIds = totals.map((t) => t.userId);
  const users = userIds.length > 0
    ? await db
        .select()
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(${userIds})`)
    : [];

  const userMap = new Map(users.map((u) => [u.id, u]));

  const myUserId = req.isAuthenticated() ? req.user.id : null;

  const entries = totals.map((t, i) => {
    const user = userMap.get(t.userId);
    return {
      rank: offset + i + 1,
      userId: t.userId as unknown as number,
      teamName: user?.teamName ?? user?.firstName ?? "Team",
      totalPoints: parseFloat(String(t.totalPoints)),
      firstName: user?.firstName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      myRank: t.userId === myUserId,
    };
  });

  // Count total unique participants
  const countResult = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${userStagePointsTable.userId})` })
    .from(userStagePointsTable);
  const total = Number(countResult[0]?.count ?? 0);

  // Find my entry if not in current page
  let myEntry = entries.find((e) => e.myRank) ?? null;
  if (!myEntry && myUserId) {
    const myTotal = await db
      .select({
        totalPoints: sql<number>`COALESCE(SUM(${userStagePointsTable.totalPoints}), 0)::numeric`,
      })
      .from(userStagePointsTable)
      .where(eq(userStagePointsTable.userId, myUserId));

    const myPoints = parseFloat(String(myTotal[0]?.totalPoints ?? 0));

    // Find my rank
    const above = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${userStagePointsTable.userId})` })
      .from(userStagePointsTable)
      .groupBy(userStagePointsTable.userId)
      .having(sql`SUM(${userStagePointsTable.totalPoints}) > ${myPoints}`);

    const myRank = above.length + 1;
    const me = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, myUserId));

    if (me[0]) {
      myEntry = {
        rank: myRank,
        userId: myUserId as unknown as number,
        teamName: me[0].teamName ?? me[0].firstName ?? "My Team",
        totalPoints: myPoints,
        firstName: me[0].firstName ?? null,
        profileImageUrl: me[0].profileImageUrl ?? null,
        myRank: true,
      };
    }
  }

  res.json({ entries, total, myEntry });
});

export default router;
