import { useListStages } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, MapPin, Calendar, Activity, ChevronRight, Lock, Unlock, CheckCircle2 } from "lucide-react";

export default function Stages() {
  const { data: stages, isLoading } = useListStages();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading stages...</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-4xl font-heading font-bold uppercase tracking-tight">The Route</h1>
        <p className="text-muted-foreground mt-1">The Full Route • 21 Stages to Glory</p>
      </header>

      <div className="grid gap-4">
        {stages?.map(stage => {
          const isCompleted = stage.status === "completed";
          const isLive = stage.status === "live";
          const isTransferClosed = stage.status === "transfer_closed";
          const isUpcoming = stage.status === "upcoming";

          return (
            <Link key={stage.id} href={`/stages/${stage.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden group">
                <div className="flex flex-col md:flex-row h-full">
                  {/* Date & Type Col */}
                  <div className="bg-secondary/50 p-4 md:w-48 shrink-0 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-2 border-b md:border-b-0 md:border-r">
                    <div className="flex flex-col items-start">
                      <span className="text-xs text-muted-foreground font-mono uppercase font-bold tracking-wider">
                        Stage {stage.stageNumber}
                      </span>
                      <span className="font-bold text-lg leading-tight">
                        {format(parseISO(stage.date), "MMM d")}
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-background">
                      {stage.stageType.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>

                  {/* Info Col */}
                  <div className="p-4 flex-1 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <MapPin className="h-4 w-4" />
                        <span>{stage.startCity} &rarr; {stage.endCity}</span>
                      </div>
                      
                      <div className="flex items-center">
                        {isCompleted && <Badge variant="secondary" className="bg-primary/20 text-primary"><CheckCircle2 className="h-3 w-3 mr-1"/> Completed</Badge>}
                        {isLive && <Badge variant="destructive" className="animate-pulse"><Activity className="h-3 w-3 mr-1"/> Live</Badge>}
                        {isTransferClosed && <Badge variant="outline" className="text-destructive border-destructive/50"><Lock className="h-3 w-3 mr-1"/> Locked</Badge>}
                        {isUpcoming && <Badge variant="outline" className="text-primary border-primary/50"><Unlock className="h-3 w-3 mr-1"/> Open</Badge>}
                      </div>
                    </div>
                    <div className="text-xl font-heading font-bold group-hover:text-primary transition-colors">
                      {stage.name}
                    </div>
                  </div>

                  <div className="hidden md:flex p-4 items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                    <ChevronRight className="h-6 w-6" />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}