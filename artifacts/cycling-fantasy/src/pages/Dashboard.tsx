import { useGetProfile, useGetMyTeam, useGetCurrentStage, useGetMyPoints, useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Bike, Map, Trophy, Users, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const { data: profile } = useGetProfile();
  const { data: team } = useGetMyTeam();
  const { data: currentStage } = useGetCurrentStage();
  const { data: points } = useGetMyPoints();
  const { data: leaderboard } = useGetLeaderboard({ limit: 1, offset: 0 }, { query: { queryKey: getGetLeaderboardQueryKey({ limit: 1, offset: 0 }) }});

  const myRank = leaderboard?.myEntry?.rank || "-";

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold uppercase tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {profile?.teamName || profile?.firstName || "Directeur Sportif"}
          </p>
        </div>
        {(!profile?.teamName) && (
          <Button variant="outline" asChild>
            <Link href="/team">Set Team Name</Link>
          </Button>
        )}
      </header>

      {team && (!team.riders || team.riders.length < 8) && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Incomplete Team</AlertTitle>
          <AlertDescription>
            You need 8 riders to score points. <Link href="/team" className="font-bold underline">Draft your team now</Link>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Points</CardTitle>
            <Trophy className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold">
              {points?.totalPoints != null ? points.totalPoints.toLocaleString() : "0"} <span className="text-sm font-sans text-muted-foreground">pts</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Rank</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold">
              #{myRank}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 bg-secondary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Stage</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {currentStage?.stage ? (
              <div className="flex flex-col gap-2">
                <div className="text-xl font-heading font-bold">
                  Stage {currentStage.stage.stageNumber}: {currentStage.stage.startCity} → {currentStage.stage.endCity}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium ring-1 ring-inset ring-muted-border">
                    {currentStage.stage.stageType.replace('_', ' ').toUpperCase()}
                  </span>
                  
                  {currentStage.transferWindowOpen ? (
                    <span className="text-primary font-mono text-sm">
                      Transfer Open
                      {currentStage.minutesUntilClose != null && ` • Closes in ${currentStage.minutesUntilClose}m`}
                    </span>
                  ) : (
                    <span className="text-destructive font-mono text-sm font-bold">
                      LOCKED
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground italic">No active stage information available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-heading font-bold">My Squad</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/team">Manage Team</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {team?.riders?.length ? (
              team.riders.slice(0, 5).map(rider => (
                <div key={rider.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center font-bold">
                      {rider.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {rider.name}
                        {team.captainRiderId === rider.id && (
                          <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">Cap</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{rider.proTeam}</div>
                    </div>
                  </div>
                  <div className="font-mono text-sm bg-secondary px-2 py-1 rounded">
                    {rider.oddsLabel}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center border rounded-lg bg-card/50 text-muted-foreground">
                No riders selected yet.
              </div>
            )}
            {team?.riders && team.riders.length > 5 && (
              <div className="text-center text-sm text-muted-foreground pt-2">
                + {team.riders.length - 5} more riders
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-heading font-bold">Recent Points</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/points">View Breakdown</Link>
            </Button>
          </div>
          
          {points?.stageBreakdown && points.stageBreakdown.length > 0 ? (
            <div className="space-y-3">
              {points.stageBreakdown.slice(-5).reverse().map(stage => (
                <div key={stage.stageId} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <div className="font-bold">Stage {stage.stageNumber}</div>
                    <div className="text-xs text-muted-foreground">{stage.stageName}</div>
                  </div>
                  <div className={`font-mono font-bold text-lg ${stage.points < 0 ? "text-destructive" : "text-primary"}`}>
                    {stage.points >= 0 ? "+" : ""}{stage.points.toLocaleString()} <span className="text-xs font-sans text-muted-foreground">pts</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border rounded-lg bg-card/50 text-muted-foreground">
              No points earned yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}