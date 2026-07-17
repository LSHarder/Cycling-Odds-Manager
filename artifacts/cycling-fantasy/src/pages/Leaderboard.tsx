import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Leaderboard() {
  const [page, setPage] = useState(0);
  const limit = 50;
  
  const { data, isLoading } = useGetLeaderboard(
    { limit, offset: page * limit }, 
    { query: { queryKey: getGetLeaderboardQueryKey({ limit, offset: page * limit }) }}
  );

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold uppercase tracking-tight flex items-center gap-3">
            <Trophy className="h-8 w-8 text-primary" />
            Global Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">The best tacticians in the peloton.</p>
        </div>
      </header>

      {data?.myEntry && (
        <div className="bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-between shadow-lg ring-1 ring-primary/20">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-heading font-black w-16 text-center">
              #{data.myEntry.rank}
            </div>
            <div>
              <div className="font-bold text-lg">{data.myEntry.teamName}</div>
              <div className="text-primary-foreground/80 text-sm">Your Team</div>
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-right">
            {data.myEntry.totalPoints.toLocaleString()} <span className="text-sm font-sans font-normal opacity-80">pts</span>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-secondary/50 text-muted-foreground uppercase font-mono text-[10px] tracking-wider border-b">
            <tr>
              <th className="px-6 py-4 font-bold w-20 text-center">Rank</th>
              <th className="px-6 py-4 font-bold">Team Name</th>
              <th className="px-6 py-4 font-bold text-right">Total Points</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">Loading standings...</td>
              </tr>
            ) : data?.entries.map((entry) => (
              <tr 
                key={entry.userId} 
                className={`transition-colors ${entry.myRank ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"}`}
              >
                <td className="px-6 py-4 text-center font-mono font-bold text-lg">
                  {entry.rank === 1 ? <Medal className="h-6 w-6 mx-auto text-yellow-500 fill-yellow-500/20" /> : 
                   entry.rank === 2 ? <Medal className="h-6 w-6 mx-auto text-gray-400 fill-gray-400/20" /> : 
                   entry.rank === 3 ? <Medal className="h-6 w-6 mx-auto text-amber-600 fill-amber-600/20" /> : 
                   `#${entry.rank}`}
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-base flex items-center gap-2">
                    {entry.teamName}
                    {entry.myRank && <Badge className="text-[10px] px-1.5 py-0">YOU</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.firstName || "Manager"}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="font-mono font-bold text-lg">
                    {entry.totalPoints.toLocaleString()} <span className="text-xs font-sans font-normal text-muted-foreground">pts</span>
                  </div>
                </td>
              </tr>
            ))}
            {data?.entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">No entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        
        {data && data.total > limit && (
          <div className="p-4 border-t flex items-center justify-between bg-secondary/20">
            <Button 
              variant="outline" 
              disabled={page === 0} 
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm font-mono text-muted-foreground">
              {page * limit + 1} - {Math.min((page + 1) * limit, data.total)} of {data.total}
            </span>
            <Button 
              variant="outline" 
              disabled={(page + 1) * limit >= data.total} 
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}