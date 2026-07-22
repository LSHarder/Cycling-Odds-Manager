import { useState } from "react";
import {
  useAdminListStages,
  useAdminProcessStage,
  useAdminPollStage,
  useAdminUpdateStage,
  useAdminUpdateStageResults,
  useAdminScrapeFromHtml,
  useAdminSyncRiders,
  useAdminCatchUpStages,
  useListRiders,
  getAdminListStagesQueryKey,
} from "@workspace/api-client-react";
import type { AdminStageResultsUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RefreshCw, Play, ShieldAlert, RotateCw, ClipboardEdit, ChevronDown, ListChecks, ClipboardPaste } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mirrors MAX_SCRAPE_ATTEMPTS in artifacts/api-server/src/lib/scheduler.ts — display only.
const MAX_SCRAPE_ATTEMPTS = 15;

interface ManualRow {
  position: string;
  dnf: boolean;
  komPointsEarned: string;
  sprintPointsEarned: string;
  hadCombativeAward: boolean;
  wearsYellow: boolean;
  wearsGreen: boolean;
  wearsPolkadot: boolean;
  wearsWhite: boolean;
}

const EMPTY_ROW: ManualRow = {
  position: "",
  dnf: false,
  komPointsEarned: "",
  sprintPointsEarned: "",
  hadCombativeAward: false,
  wearsYellow: false,
  wearsGreen: false,
  wearsPolkadot: false,
  wearsWhite: false,
};

function ManualResultsEditor({ stageId }: { stageId: number }) {
  const { data: riders, isLoading: ridersLoading } = useListRiders();
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Record<number, ManualRow>>({});
  const saveResults = useAdminUpdateStageResults();
  const { toast } = useToast();

  const updateRow = (riderId: number, patch: Partial<ManualRow>) => {
    setRows((prev) => ({ ...prev, [riderId]: { ...(prev[riderId] ?? EMPTY_ROW), ...patch } }));
  };

  const filteredRiders = (riders ?? []).filter((r) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.proTeam.toLowerCase().includes(q);
  });

  const handleSave = () => {
    const entries: AdminStageResultsUpdate = Object.entries(rows).map(([riderId, row]) => ({
      riderId: Number(riderId),
      position: row.dnf || row.position === "" ? null : Number(row.position),
      dnf: row.dnf,
      komPointsEarned: row.komPointsEarned === "" ? undefined : Number(row.komPointsEarned),
      sprintPointsEarned: row.sprintPointsEarned === "" ? undefined : Number(row.sprintPointsEarned),
      hadCombativeAward: row.hadCombativeAward,
      wearsYellow: row.wearsYellow,
      wearsGreen: row.wearsGreen,
      wearsPolkadot: row.wearsPolkadot,
      wearsWhite: row.wearsWhite,
    }));

    if (entries.length === 0) {
      toast({ title: "Nothing to save", description: "Edit at least one rider's result first." });
      return;
    }

    saveResults.mutate(
      { id: stageId, data: entries },
      {
        onSuccess: (data) => {
          toast({ title: "Results saved", description: `Saved ${data.count} rider result(s).` });
          setRows({});
        },
        onError: () => {
          toast({ title: "Save failed", description: "Could not save manual results.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="mt-4 border rounded-md p-4 space-y-3">
      <Input
        placeholder="Filter by rider or team..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="max-h-80 overflow-y-auto border rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rider</TableHead>
              <TableHead className="w-20">Pos</TableHead>
              <TableHead className="w-14">DNF</TableHead>
              <TableHead className="w-20">KOM</TableHead>
              <TableHead className="w-20">Sprint</TableHead>
              <TableHead className="w-14">Y</TableHead>
              <TableHead className="w-14">G</TableHead>
              <TableHead className="w-14">PD</TableHead>
              <TableHead className="w-14">W</TableHead>
              <TableHead className="w-14">Comb.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ridersLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Loading riders...
                </TableCell>
              </TableRow>
            ) : (
              filteredRiders.map((rider) => {
                const row = rows[rider.id] ?? EMPTY_ROW;
                return (
                  <TableRow key={rider.id}>
                    <TableCell className="text-sm">
                      {rider.name}
                      <div className="text-xs text-muted-foreground">{rider.proTeam}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-16"
                        value={row.position}
                        disabled={row.dnf}
                        onChange={(e) => updateRow(rider.id, { position: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.dnf}
                        onCheckedChange={(v) => updateRow(rider.id, { dnf: v === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-16"
                        value={row.komPointsEarned}
                        onChange={(e) => updateRow(rider.id, { komPointsEarned: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-16"
                        value={row.sprintPointsEarned}
                        onChange={(e) => updateRow(rider.id, { sprintPointsEarned: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.wearsYellow}
                        onCheckedChange={(v) => updateRow(rider.id, { wearsYellow: v === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.wearsGreen}
                        onCheckedChange={(v) => updateRow(rider.id, { wearsGreen: v === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.wearsPolkadot}
                        onCheckedChange={(v) => updateRow(rider.id, { wearsPolkadot: v === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.wearsWhite}
                        onCheckedChange={(v) => updateRow(rider.id, { wearsWhite: v === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.hadCombativeAward}
                        onCheckedChange={(v) => updateRow(rider.id, { hadCombativeAward: v === true })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <Button onClick={handleSave} disabled={saveResults.isPending} size="sm">
        Save Results
      </Button>
    </div>
  );
}

// Fallback for when PCS has blocked this server's own outbound requests
// outright (a real 403 from curl itself, not just the usual Node-fetch
// block) -- an admin's own browser isn't on that block list, so they can
// open the stage's PCS results page normally, view source / save it, and
// paste the HTML here instead. Same parser as the live scraper.
function ScrapeFromHtmlEditor({ stageId }: { stageId: number }) {
  const [html, setHtml] = useState("");
  const [complementaryHtml, setComplementaryHtml] = useState("");
  const scrapeFromHtml = useAdminScrapeFromHtml();
  const { toast } = useToast();

  const handleSubmit = () => {
    if (!html.trim()) {
      toast({ title: "Nothing pasted", description: "Paste the stage's PCS results page source first." });
      return;
    }

    scrapeFromHtml.mutate(
      { id: stageId, data: { html, complementaryHtml: complementaryHtml.trim() || undefined } },
      {
        onSuccess: (data) => {
          const unmatched = data.ridersUnmatched.length
            ? ` (${data.ridersUnmatched.length} unmatched: ${data.ridersUnmatched.slice(0, 5).join(", ")}${data.ridersUnmatched.length > 5 ? "…" : ""})`
            : "";
          toast({ title: "Results parsed", description: `Matched ${data.ridersMatched} rider(s).${unmatched}` });
          setHtml("");
          setComplementaryHtml("");
        },
        onError: (err) => {
          toast({
            title: "Parse failed",
            description: err instanceof Error ? err.message : "Could not parse the pasted HTML.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="mt-4 border rounded-md p-4 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Stage results page source (open the stage's PCS URL in your own browser, view source, paste here)
        </Label>
        <Textarea
          placeholder="<html>...</html>"
          className="font-mono text-xs h-32"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Optional: /info/complementary-results page source (for the combative-rider award)
        </Label>
        <Textarea
          placeholder="<html>...</html>"
          className="font-mono text-xs h-24"
          value={complementaryHtml}
          onChange={(e) => setComplementaryHtml(e.target.value)}
        />
      </div>
      <Button onClick={handleSubmit} disabled={scrapeFromHtml.isPending} size="sm">
        Parse & Save Results
      </Button>
    </div>
  );
}

export default function Admin() {
  const { data: stages, isLoading: stagesLoading } = useAdminListStages({ query: { queryKey: getAdminListStagesQueryKey() }});
  const processStage = useAdminProcessStage();
  const pollStage = useAdminPollStage();
  const updateStage = useAdminUpdateStage();
  const syncRiders = useAdminSyncRiders();
  const catchUp = useAdminCatchUpStages();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateStages = () => queryClient.invalidateQueries({ queryKey: getAdminListStagesQueryKey() });

  const handleCatchUp = () => {
    catchUp.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Catch-up complete",
          description: `Processed ${data.processed} of ${data.attempted} pending stage(s).`,
        });
        invalidateStages();
      },
      onError: () => {
        toast({ title: "Catch-up failed", description: "Could not process pending stages.", variant: "destructive" });
      },
    });
  };

  const handleSyncRiders = () => {
    syncRiders.mutate(undefined, {
      onSuccess: (data) => {
        toast({ title: "Sync Complete", description: data.message });
      },
      onError: () => {
        toast({ title: "Sync Failed", description: "Could not sync riders from PCS.", variant: "destructive" });
      }
    });
  };

  const handleProcessStage = (stageId: number) => {
    processStage.mutate(
      { id: stageId },
      {
        onSuccess: (data) => {
          toast({ title: "Stage Processed", description: data.message });
          invalidateStages();
        },
        onError: () => {
          toast({ title: "Processing Failed", description: "Could not process stage results.", variant: "destructive" });
        }
      }
    );
  };

  const handlePollStage = (stageId: number) => {
    pollStage.mutate(
      { id: stageId },
      {
        onSuccess: (data) => {
          if (data.processed) {
            toast({ title: "Auto-processed", description: `Matched ${data.ridersMatched ?? 0} riders and distributed points.` });
          } else if (data.error) {
            toast({ title: "Scrape failed", description: data.error, variant: "destructive" });
          } else {
            toast({ title: "Not ready yet", description: "PCS doesn't have full results for this stage yet." });
          }
          invalidateStages();
        },
        onError: () => {
          toast({ title: "Poll failed", description: "Could not trigger a scrape attempt.", variant: "destructive" });
        }
      }
    );
  };

  const handleTogglePolling = (stageId: number, pollingEnabled: boolean) => {
    updateStage.mutate(
      { id: stageId, data: { pollingEnabled } },
      {
        onSuccess: invalidateStages,
        onError: () => {
          toast({ title: "Update failed", description: "Could not change auto-scrape setting.", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold uppercase tracking-tight flex items-center gap-3 text-destructive">
            <ShieldAlert className="h-8 w-8" />
            Race Control
          </h1>
          <p className="text-muted-foreground mt-1">Admin dashboard. Proceed with caution.</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleCatchUp} disabled={catchUp.isPending} variant="outline" className="gap-2">
            <ListChecks className={`h-4 w-4 ${catchUp.isPending ? "animate-spin" : ""}`} />
            Catch Up Pending Stages
          </Button>
          <Button onClick={handleSyncRiders} disabled={syncRiders.isPending} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncRiders.isPending ? "animate-spin" : ""}`} />
            Sync Riders from PCS
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <h2 className="text-2xl font-heading font-bold">Stage Management</h2>

        {stagesLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading stages...</div>
        ) : (
          <div className="grid gap-4">
            {stages?.map(stage => (
              <Card key={stage.id} className={stage.resultsProcessed ? "bg-muted/50 border-dashed" : "border-primary/20"}>
                <CardContent className="p-6 flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm text-muted-foreground">STAGE {stage.stageNumber}</span>
                        <Badge variant={stage.resultsProcessed ? "secondary" : "default"} className={stage.resultsProcessed ? "" : "bg-primary text-primary-foreground"}>
                          {stage.status.toUpperCase()}
                        </Badge>
                        {stage.resultsProcessed && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">PROCESSED</Badge>
                        )}
                      </div>
                      <div className="text-xl font-bold">{stage.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Start: {stage.startTime ? new Date(stage.startTime).toLocaleString() : "Not scraped yet"}
                        {" · "}Deadline: {stage.transferDeadline ? new Date(stage.transferDeadline).toLocaleString() : "None"}
                      </div>
                      {!stage.resultsProcessed && (
                        <div className="text-xs text-muted-foreground">
                          Last scrape attempt: {stage.lastScrapeAttemptAt ? new Date(stage.lastScrapeAttemptAt).toLocaleString() : "never"}
                          {" · "}Attempts: {stage.scrapeAttempts ?? 0}/{MAX_SCRAPE_ATTEMPTS}
                        </div>
                      )}
                      {stage.lastScrapeError && !stage.resultsProcessed && (
                        <div className="text-xs text-destructive">{stage.lastScrapeError}</div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {!stage.resultsProcessed && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`auto-${stage.id}`} className="text-xs text-muted-foreground">
                            Auto-scrape
                          </Label>
                          <Switch
                            id={`auto-${stage.id}`}
                            checked={stage.pollingEnabled ?? true}
                            disabled={updateStage.isPending}
                            onCheckedChange={(checked) => handleTogglePolling(stage.id, checked)}
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        {!stage.resultsProcessed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={pollStage.isPending}
                            onClick={() => handlePollStage(stage.id)}
                          >
                            <RotateCw className={`h-4 w-4 ${pollStage.isPending ? "animate-spin" : ""}`} />
                            Retry Scrape Now
                          </Button>
                        )}
                        <Button
                          variant="default"
                          className="gap-2"
                          disabled={stage.resultsProcessed || processStage.isPending}
                          onClick={() => handleProcessStage(stage.id)}
                        >
                          <Play className="h-4 w-4" />
                          Process Results
                        </Button>
                      </div>
                    </div>
                  </div>

                  {!stage.resultsProcessed && (
                    <div className="flex flex-col gap-2">
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2 self-start">
                            <ClipboardPaste className="h-4 w-4" />
                            Paste Results from PCS
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ScrapeFromHtmlEditor stageId={stage.id} />
                        </CollapsibleContent>
                      </Collapsible>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2 self-start">
                            <ClipboardEdit className="h-4 w-4" />
                            Enter Results Manually
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ManualResultsEditor stageId={stage.id} />
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
