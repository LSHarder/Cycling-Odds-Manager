import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, userStagePointsTable, usersTable, userTeamRidersTable } from "@workspace/db";
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

  // Include ALL users who have created a team (at least one rider), ordered by:
  //   1. Total points DESC
  //   2. Account creation time ASC (first to join ranks higher on equal points)
  const totals = await db.execute(sql`
    SELECT
      u.id                                              AS user_id,
      COALESCE(SUM(usp.total_points), 0)::numeric       AS total_points,
      u.created_at
    FROM ${usersTable} u
    INNER JOIN (
      SELECT DISTINCT user_id FROM ${userTeamRidersTable}
    ) utr ON utr.user_id = u.id
    LEFT JOIN ${userStagePointsTable} usp ON usp.user_id = u.id
    GROUP BY u.id, u.created_at
    ORDER BY total_points DESC, u.created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Get user info for each row
  const userIds = totals.rows.map((t: any) => t.user_id as string);
  const users =
    userIds.length > 0
      ? await db
          .select()
          .from(usersTable)
          .where(sql`${usersTable.id} = ANY(${userIds})`)
      : [];

  const userMap = new Map(users.map((u) => [u.id, u]));
  const myUserId = req.isAuthenticated() ? req.user.id : null;

  const entries = totals.rows.map((t: any, i: number) => {
    const user = userMap.get(t.user_id as string);
    return {
      rank: offset + i + 1,
      userId: t.user_id as unknown as number,
      teamName: user?.teamName ?? user?.firstName ?? "My Team",
      totalPoints: parseFloat(String(t.total_points)),
      firstName: user?.firstName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      myRank: t.user_id === myUserId,
    };
  });

  // Count total unique participants (anyone with a team row)
  const countResult = await db.execute(sql`
    SELECT COUNT(DISTINCT user_id)::integer AS count FROM ${userTeamRidersTable}
  `);
  const total = Number((countResult.rows[0] as any)?.count ?? 0);

  // Find my entry if not in current page
  let myEntry = entries.find((e) => e.myRank) ?? null;
  if (!myEntry && myUserId) {
    const myRow = await db.execute(sql`
      SELECT
        COALESCE(SUM(usp.total_points), 0)::numeric AS total_points
      FROM ${usersTable} u
      INNER JOIN (SELECT DISTINCT user_id FROM ${userTeamRidersTable}) utr ON utr.user_id = u.id
      LEFT JOIN ${userStagePointsTable} usp ON usp.user_id = u.id
      WHERE u.id = ${myUserId}
      GROUP BY u.id
    `);

    const myPoints = parseFloat(String((myRow.rows[0] as any)?.total_points ?? 0));

    // Count how many teams rank above mine
    const aboveRow = await db.execute(sql`
      SELECT COUNT(*)::integer AS count
      FROM (
        SELECT u.id, COALESCE(SUM(usp.total_points), 0)::numeric AS pts, u.created_at
        FROM ${usersTable} u
        INNER JOIN (SELECT DISTINCT user_id FROM ${userTeamRidersTable}) utr ON utr.user_id = u.id
        LEFT JOIN ${userStagePointsTable} usp ON usp.user_id = u.id
        WHERE u.id != ${myUserId}
        GROUP BY u.id, u.created_at
      ) ranked
      WHERE pts > ${myPoints}
         OR (pts = ${myPoints} AND created_at < (SELECT created_at FROM ${usersTable} WHERE id = ${myUserId}))
    `);

    const myRank = Number((aboveRow.rows[0] as any)?.count ?? 0) + 1;
    const me = await db.select().from(usersTable).where(eq(usersTable.id, myUserId));

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
