import { 
  useAdminListStages, 
  useAdminProcessStage, 
  useAdminSyncRiders,
  getAdminListStagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Play, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { data: stages, isLoading: stagesLoading } = useAdminListStages({ query: { queryKey: getAdminListStagesQueryKey() }});
  const processStage = useAdminProcessStage();
  const syncRiders = useAdminSyncRiders();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
          queryClient.invalidateQueries({ queryKey: getAdminListStagesQueryKey() });
        },
        onError: () => {
          toast({ title: "Processing Failed", description: "Could not process stage results.", variant: "destructive" });
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
        
        <Button onClick={handleSyncRiders} disabled={syncRiders.isPending} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncRiders.isPending ? "animate-spin" : ""}`} />
          Sync Riders from PCS
        </Button>
      </header>

      <div className="space-y-4">
        <h2 className="text-2xl font-heading font-bold">Stage Management</h2>
        
        {stagesLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading stages...</div>
        ) : (
          <div className="grid gap-4">
            {stages?.map(stage => (
              <Card key={stage.id} className={stage.resultsProcessed ? "bg-muted/50 border-dashed" : "border-primary/20"}>
                <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
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
                      Deadline: {stage.transferDeadline ? new Date(stage.transferDeadline).toLocaleString() : "None"}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}