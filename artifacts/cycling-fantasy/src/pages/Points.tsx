import { useGetMyPoints, useGetStagePoints, getGetMyPointsQueryKey, getGetStagePointsQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function StagePointsRow({ stageId, stageNumber, stageName, totalPoints }: { stageId: number, stageNumber: number, stageName: string, totalPoints: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: detail, isLoading } = useGetStagePoints(stageId, { 
    query: { 
      queryKey: getGetStagePointsQueryKey(stageId), 
      enabled: isOpen 
    } 
  });

  return (
    <div className="border rounded-xl bg-card overflow-hidden mb-4 transition-all">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-secondary flex flex-col items-center justify-center shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground uppercase font-bold leading-none">Stage</span>
            <span className="text-xl font-heading font-black leading-none mt-1">{stageNumber}</span>
          </div>
          <div>
            <div className="font-bold">{stageName}</div>
            <div className="text-sm text-muted-foreground">Tap to view rider breakdown</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-mono font-bold text-xl text-primary">{totalPoints.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">pts</div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-muted-foreground">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t bg-secondary/10 p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading rider points...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase font-mono text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-2 font-bold">Rider</th>
                    <th className="px-4 py-2 font-bold text-center">Odds</th>
                    <th className="px-4 py-2 font-bold text-center">Base Pts</th>
                    <th className="px-4 py-2 font-bold text-center">Multiplier</th>
                    <th className="px-4 py-2 font-bold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {detail?.riderPoints.map((rp, i) => (
                    <tr key={i} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold flex items-center gap-2">
                          {rp.riderName}
                          {rp.isCaptain && <Badge className="text-[10px] px-1 py-0 h-4 bg-primary text-primary-foreground">CAP x2</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2 mt-1">
                          {rp.breakdown.stage > 0 && <span>Pos: {rp.breakdown.stage}</span>}
                          {rp.breakdown.kom > 0 && <span>KOM: {rp.breakdown.kom}</span>}
                          {rp.breakdown.sprint > 0 && <span>Sprint: {rp.breakdown.sprint}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-muted-foreground">
                        {rp.oddsDecimal ? rp.oddsDecimal.toFixed(2) : "-"}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {rp.basePoints}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-muted-foreground">
                        ×{rp.multiplier.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                        {rp.totalPoints}
                      </td>
                    </tr>
                  ))}
                  {(!detail?.riderPoints || detail.riderPoints.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No points for this stage.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Points() {
  const { data, isLoading } = useGetMyPoints({ query: { queryKey: getGetMyPointsQueryKey() } });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading points...</div>;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold uppercase tracking-tight">My Points</h1>
          <p className="text-muted-foreground mt-1">Detailed breakdown of your scoring.</p>
        </div>
      </header>

      <Card className="bg-primary text-primary-foreground border-none">
        <CardContent className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary-foreground/10 flex items-center justify-center">
              <Trophy className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <div className="text-primary-foreground/80 font-medium">Total Score</div>
              <div className="text-4xl font-mono font-black">{data?.totalPoints?.toLocaleString() || 0} pts</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-heading font-bold mb-4">Stage History</h2>
        {data?.stageBreakdown?.length ? (
          data.stageBreakdown.slice().reverse().map(stage => (
            <StagePointsRow
              key={stage.stageId}
              stageId={stage.stageId}
              stageNumber={stage.stageNumber}
              stageName={stage.stageName}
              totalPoints={stage.points}
            />
          ))
        ) : (
          <div className="p-12 border border-dashed rounded-xl text-center text-muted-foreground bg-card/30">
            No stage points recorded yet. Wait for the peloton to finish!
          </div>
        )}
      </div>
    </div>
  );
}