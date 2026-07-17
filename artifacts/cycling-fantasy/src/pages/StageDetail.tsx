import { useGetStage, getGetStageQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ChevronLeft, Calendar } from "lucide-react";

export default function StageDetail() {
  const { id } = useParams<{ id: string }>();
  const stageId = parseInt(id || "0", 10);
  const { data, isLoading } = useGetStage(stageId, { query: { queryKey: getGetStageQueryKey(stageId), enabled: !!stageId } });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading stage...</div>;
  }

  if (!data?.stage) {
    return <div className="p-8 text-center text-muted-foreground">Stage not found.</div>;
  }

  const { stage, results } = data;
  const isCompleted = stage.status === "completed";

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <Link href="/stages" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Stages
      </Link>

      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge className="font-mono text-sm">STAGE {stage.stageNumber}</Badge>
          <Badge variant="outline" className="uppercase">{stage.stageType.replace('_', ' ')}</Badge>
          <Badge variant={isCompleted ? "secondary" : "default"} className={isCompleted ? "bg-primary/20 text-primary" : ""}>
            {stage.status.toUpperCase()}
          </Badge>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-heading font-black tracking-tight">{stage.name}</h1>
        
        <div className="flex flex-wrap items-center gap-6 text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <span className="font-medium">{format(parseISO(stage.date), "EEEE, MMMM do, yyyy")}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            <span className="font-medium">{stage.startCity} &rarr; {stage.endCity}</span>
          </div>
        </div>
      </header>

      {!isCompleted ? (
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="p-12 text-center flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <MapPin className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-heading font-bold">Stage Not Completed</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Results and fantasy points will appear here once the stage is finished and processed.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <h2 className="text-2xl font-heading font-bold">Stage Results & Fantasy Points</h2>
          
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase font-mono text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-bold w-16 text-center">Pos</th>
                    <th className="px-4 py-3 font-bold">Rider</th>
                    <th className="px-4 py-3 font-bold">Team</th>
                    <th className="px-4 py-3 font-bold text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results?.map((result, idx) => (
                    <tr key={result.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-center font-mono font-bold text-muted-foreground">
                        {result.dnf ? "DNF" : result.position || "-"}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {result.riderName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {result.proTeam}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center justify-center bg-primary/10 text-primary font-mono font-bold px-2 py-1 rounded">
                          {result.fantasyPoints} pts
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!results || results.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No results available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}