import { useGetMyPoints, useGetStagePoints, getGetMyPointsQueryKey, getGetStagePointsQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Trophy, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RiderBreakdown {
  riderName: string;
  isCaptain: boolean;
  oddsDecimal: number;
  multiplier: number;
  basePoints: number;
  totalPoints: number;
  breakdown: {
    stage: number;
    jerseys: number;
    kom: number;
    sprint: number;
    combative: number;
    penalty: number;
  };
}

function RiderMathPanel({ rp }: { rp: RiderBreakdown }) {
  const m = rp.multiplier;
  const b = rp.breakdown;

  // Odds-scaled categories
  const scaledStage   = Math.round(b.stage     * m * 100) / 100;
  const scaledKom     = Math.round(b.kom       * m * 100) / 100;
  const scaledSprint  = Math.round(b.sprint    * m * 100) / 100;
  const scaledComb    = Math.round(b.combative * m * 100) / 100;

  // Subtotal before captain
  const preCapt = rp.basePoints;

  const rows: { label: string; value: number; note?: string; dim?: boolean }[] = [];

  if (b.stage !== 0) rows.push({
    label: "Stage position",
    value: scaledStage,
    note: `${b.stage} pts × ×${m.toFixed(2)}`,
  });
  if (b.kom !== 0) rows.push({
    label: "Mountain (KOM)",
    value: scaledKom,
    note: `${b.kom} pts × ×${m.toFixed(2)}`,
  });
  if (b.sprint !== 0) rows.push({
    label: "Sprint bonus",
    value: scaledSprint,
    note: `${b.sprint} pts × ×${m.toFixed(2)}`,
  });
  if (b.combative !== 0) rows.push({
    label: "Combative award",
    value: scaledComb,
    note: `${b.combative} pts × ×${m.toFixed(2)}`,
  });
  if (b.jerseys !== 0) rows.push({
    label: "Jersey bonus",
    value: b.jerseys,
    note: "flat (no odds scaling)",
    dim: true,
  });
  if (b.penalty !== 0) rows.push({
    label: b.penalty === -30 ? "DNF penalty" : "Bottom 20% penalty",
    value: b.penalty,
    note: "flat",
    dim: true,
  });

  return (
    <div className="bg-muted/30 border-t border-border/50 px-4 py-3 space-y-1.5 text-xs font-mono">
      {rows.length === 0 && (
        <div className="text-muted-foreground text-center py-1">No activity this stage.</div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className={r.dim ? "text-muted-foreground" : "text-foreground"}>
            {r.label}
            {r.note && <span className="text-muted-foreground ml-1">({r.note})</span>}
          </span>
          <span className={`font-bold tabular-nums ${r.value < 0 ? "text-destructive" : "text-foreground"}`}>
            {r.value > 0 ? "+" : ""}{r.value}
          </span>
        </div>
      ))}

      {/* Divider + subtotal */}
      <div className="border-t border-border/50 pt-1.5 flex items-center justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-bold tabular-nums">{preCapt}</span>
      </div>

      {rp.isCaptain && (
        <div className="flex items-center justify-between text-primary">
          <span>Captain ×2</span>
          <span className="font-bold tabular-nums">= {rp.totalPoints}</span>
        </div>
      )}

      {/* Final */}
      <div className="border-t border-border/50 pt-1.5 flex items-center justify-between text-sm">
        <span className="font-bold text-foreground">Total</span>
        <span className="font-black text-primary tabular-nums">{rp.totalPoints} pts</span>
      </div>
    </div>
  );
}

function RiderRow({ rp }: { rp: RiderBreakdown }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/30 last:border-0">
      {/* Summary row — click to expand */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
            {rp.riderName}
            {rp.isCaptain && (
              <Badge className="text-[10px] px-1 py-0 h-4 bg-primary text-primary-foreground">CAP ×2</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex gap-3 mt-0.5 font-mono">
            <span>Odds: {rp.oddsDecimal?.toFixed(2)}</span>
            <span>×{rp.multiplier.toFixed(2)}</span>
            {rp.breakdown.stage > 0 && <span className="text-foreground">Pos: {rp.breakdown.stage}pts</span>}
            {rp.breakdown.jerseys > 0 && <span className="text-yellow-500">Jersey: +{rp.breakdown.jerseys}</span>}
            {rp.breakdown.kom > 0 && <span className="text-blue-400">KOM: +{rp.breakdown.kom}</span>}
            {rp.breakdown.sprint > 0 && <span className="text-green-400">Sprint: +{rp.breakdown.sprint}</span>}
            {rp.breakdown.combative > 0 && <span className="text-purple-400">Combative: +{rp.breakdown.combative}</span>}
            {rp.breakdown.penalty < 0 && <span className="text-destructive">Penalty: {rp.breakdown.penalty}</span>}
          </div>
        </div>
        <div className="font-mono font-bold text-primary tabular-nums shrink-0">
          {rp.totalPoints}
        </div>
      </button>

      {/* Expanded math */}
      {open && <RiderMathPanel rp={rp} />}
    </div>
  );
}

function StagePointsRow({
  stageId,
  stageNumber,
  stageName,
  totalPoints,
}: {
  stageId: number;
  stageNumber: number;
  stageName: string;
  totalPoints: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: detail, isLoading } = useGetStagePoints(stageId, {
    query: {
      queryKey: getGetStagePointsQueryKey(stageId),
      enabled: isOpen,
    },
  });

  return (
    <div className="border rounded-xl bg-card overflow-hidden mb-4 transition-all">
      {/* Stage header */}
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
            <div className="text-sm text-muted-foreground">Click to see rider breakdown</div>
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

      {/* Per-rider breakdown */}
      {isOpen && (
        <div className="border-t bg-card">
          {/* Column headers */}
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary/30 text-muted-foreground uppercase font-mono text-[10px] tracking-wider">
            <span className="w-3.5 shrink-0" />
            <span className="flex-1">Rider</span>
            <span className="shrink-0">Points</span>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading rider points...</div>
          ) : detail?.riderPoints && detail.riderPoints.length > 0 ? (
            <div>
              {detail.riderPoints.map((rp, i) => (
                <RiderRow key={i} rp={rp as RiderBreakdown} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-muted-foreground text-sm">No points for this stage.</div>
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
      <header>
        <h1 className="text-4xl font-heading font-bold uppercase tracking-tight">My Points</h1>
        <p className="text-muted-foreground mt-1">Click any stage to see your riders' breakdown — then click a rider to see the full math.</p>
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
          data.stageBreakdown
            .slice()
            .reverse()
            .map((stage) => (
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
