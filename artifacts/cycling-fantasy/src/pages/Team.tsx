import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetMyTeam, 
  useListRiders, 
  useUpdateMyTeam, 
  getGetMyTeamQueryKey,
  useGetCurrentStage,
  useGetProfile,
  useUpdateProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JerseyIcon } from "@/components/JerseyIcon";
import { Search, Info, X, Lock, Unlock, Pencil, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Team() {
  const { data: team, isLoading: teamLoading } = useGetMyTeam({ query: { queryKey: getGetMyTeamQueryKey() }});
  const { data: allRiders } = useListRiders();
  const { data: currentStage } = useGetCurrentStage();
  const { data: profile } = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  const updateTeam = useUpdateMyTeam();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [localTeam, setLocalTeam] = useState<{ id: number; isCaptain: boolean }[]>([]);
  const isInitialized = useRef(false);

  // Team name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    if (team && !isInitialized.current) {
      setLocalTeam(
        (team.riders || []).map(r => ({
          id: r.id,
          isCaptain: team.captainRiderId === r.id
        }))
      );
      isInitialized.current = true;
    }
  }, [team]);

  // Pre-fill name input when we start editing
  const startEditing = () => {
    setNameInput(profile?.teamName ?? profile?.firstName ?? "");
    setEditingName(true);
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "Team name cannot be empty.", variant: "destructive" });
      return;
    }
    updateProfile.mutate(
      { data: { teamName: trimmed } },
      {
        onSuccess: () => {
          toast({ title: "Team name updated!" });
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          setEditingName(false);
        },
        onError: () => {
          toast({ title: "Error", description: "Could not save team name.", variant: "destructive" });
        },
      }
    );
  };

  const filteredRiders = useMemo(() => {
    if (!allRiders) return [];
    return allRiders.filter(r => 
      r.name.toLowerCase().includes(search.toLowerCase()) || 
      r.proTeam.toLowerCase().includes(search.toLowerCase())
    );
  }, [allRiders, search]);

  const isTransferOpen = currentStage?.transferWindowOpen ?? false;

  const handleSave = () => {
    if (localTeam.length !== 8) {
      toast({ title: "Team incomplete", description: `Select ${8 - localTeam.length} more rider${8 - localTeam.length === 1 ? "" : "s"} — a team must have exactly 8.`, variant: "destructive" });
      return;
    }
    const captainId = localTeam.find(r => r.isCaptain)?.id;
    if (!captainId) {
      toast({ title: "Select a captain", description: "You must designate one rider as captain.", variant: "destructive" });
      return;
    }

    updateTeam.mutate(
      { data: { riderIds: localTeam.map(r => r.id), captainRiderId: captainId || 0 } },
      {
        onSuccess: () => {
          toast({ title: "Team saved", description: "Your squad has been updated." });
          queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save team.", variant: "destructive" });
        }
      }
    );
  };

  const handleAddRider = (riderId: number) => {
    if (!isTransferOpen) return;
    if (allRiders?.find(r => r.id === riderId)?.dnf) return;
    if (localTeam.length >= 8) {
      toast({ title: "Team full", description: "You can only select 8 riders.", variant: "destructive" });
      return;
    }
    if (localTeam.find(r => r.id === riderId)) return;
    setLocalTeam([...localTeam, { id: riderId, isCaptain: localTeam.length === 0 }]);
  };

  const handleRemoveRider = (riderId: number) => {
    if (!isTransferOpen) return;
    setLocalTeam(prev => {
      const next = prev.filter(r => r.id !== riderId);
      if (next.length > 0 && !next.some(r => r.isCaptain)) {
        next[0].isCaptain = true;
      }
      return next;
    });
  };

  const handleSetCaptain = (riderId: number) => {
    if (!isTransferOpen) return;
    setLocalTeam(prev => prev.map(r => ({ ...r, isCaptain: r.id === riderId })));
  };

  if (teamLoading) return <div className="p-8 text-center text-muted-foreground">Loading team...</div>;

  const displayName = profile?.teamName ?? profile?.firstName ?? "My Team";

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          {/* Editable team name */}
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                className="text-2xl font-heading font-bold h-12 w-64"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                autoFocus
                maxLength={40}
              />
              <Button size="icon" variant="default" onClick={saveName} disabled={updateProfile.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-4xl font-heading font-bold uppercase tracking-tight">{displayName}</h1>
              <button
                onClick={startEditing}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Rename team"
              >
                <Pencil className="h-5 w-5" />
              </button>
            </div>
          )}
          <p className="text-muted-foreground mt-1">Draft 8 riders. Pick a captain. Master the odds.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              {isTransferOpen ? (
                <Unlock className="h-4 w-4 text-primary" />
              ) : (
                <Lock className="h-4 w-4 text-destructive" />
              )}
              <span className={`font-mono font-bold ${isTransferOpen ? "text-primary" : "text-destructive"}`}>
                {isTransferOpen ? "TRANSFERS OPEN" : "LOCKED"}
              </span>
            </div>
            {isTransferOpen && currentStage?.minutesUntilClose != null && (
              <span className="text-xs text-muted-foreground font-mono">Closes in {currentStage.minutesUntilClose}m</span>
            )}
          </div>
          
          <Button onClick={handleSave} disabled={!isTransferOpen || updateTeam.isPending || localTeam.length !== 8} className="font-bold">
            {updateTeam.isPending ? "Saving..." : "Save Team"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Current Team */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-heading font-bold">Selected ({localTeam.length}/8)</h2>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Info className="h-4 w-4" /> {isTransferOpen ? "Tap a rider to set as Captain (2× points)" : "Transfers locked for this stage"}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, idx) => {
              const localRiderInfo = localTeam[idx];
              const rider = localRiderInfo ? allRiders?.find(r => r.id === localRiderInfo.id) : null;
              
              if (!rider || !localRiderInfo) {
                return (
                  <div key={`empty-${idx}`} className="h-24 border-2 border-dashed border-muted rounded-xl flex items-center justify-center text-muted-foreground bg-card/30">
                    <span className="font-mono text-sm opacity-50">Empty Slot</span>
                  </div>
                );
              }

              return (
                <Card 
                  key={rider.id} 
                  className={`overflow-hidden transition-all ${
                    localRiderInfo.isCaptain 
                      ? "ring-2 ring-primary border-primary bg-primary/5" 
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => handleSetCaptain(rider.id)}
                  style={{ cursor: isTransferOpen ? "pointer" : "default" }}
                >
                  <CardContent className="p-0 relative flex h-full">
                    {/* Status/Jerseys */}
                    <div className="absolute top-2 left-2 flex gap-1 z-10">
                      {rider.currentJerseys?.map(j => (
                        <JerseyIcon key={j} type={j} className="h-4 w-4" />
                      ))}
                    </div>
                    {rider.dnf && (
                      <div className="absolute top-2 left-2 z-10">
                        <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">DNF</Badge>
                      </div>
                    )}
                    
                    {/* Odds Banner */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="absolute top-0 right-0 bg-secondary text-secondary-foreground font-mono text-xs font-bold px-2 py-1 rounded-bl-lg">
                          {rider.oddsLabel}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Multiplier: ×{Math.sqrt(rider.oddsDecimal).toFixed(2)}</p>
                      </TooltipContent>
                    </Tooltip>

                    <div className="p-3 pt-5 flex flex-col justify-end w-full h-24 relative">
                      <div className="font-bold leading-tight truncate pr-6">{rider.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{rider.proTeam}</div>
                      
                      {localRiderInfo.isCaptain && (
                        <div className="absolute bottom-2 right-2">
                          <Badge className="bg-primary text-primary-foreground hover:bg-primary font-black uppercase text-[10px]">
                            Captain
                          </Badge>
                        </div>
                      )}
                      
                      {isTransferOpen && (
                        <button 
                          className="absolute bottom-2 right-2 h-6 w-6 bg-destructive/10 text-destructive rounded flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveRider(rider.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Rider Pool */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-20 space-y-4">
            <h2 className="text-xl font-heading font-bold">Rider Pool</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search riders or teams..." 
                className="pl-9 bg-card"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <div className="border rounded-xl bg-card h-[600px] overflow-y-auto overflow-x-hidden">
              <div className="p-2 flex flex-col gap-1">
                {filteredRiders.map(rider => {
                  const isSelected = localTeam.some(r => r.id === rider.id);
                  const isUnavailable = isSelected || rider.dnf;
                  return (
                    <div
                      key={rider.id}
                      className={`flex items-center justify-between p-2 rounded-lg text-sm transition-colors ${
                        isUnavailable
                          ? "opacity-50 grayscale"
                          : isTransferOpen
                          ? "hover:bg-secondary cursor-pointer"
                          : "cursor-default"
                      }`}
                      onClick={() => !isUnavailable && handleAddRider(rider.id)}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="flex gap-0.5 w-8 shrink-0 justify-end">
                          {rider.dnf ? (
                            <Badge variant="destructive" className="text-[9px] px-1">DNF</Badge>
                          ) : rider.currentJerseys?.length ? (
                            rider.currentJerseys.slice(0,2).map(j => <JerseyIcon key={j} type={j} className="h-4 w-4" />)
                          ) : (
                            <span className="w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{rider.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{rider.proTeam}</div>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3 pl-2">
                        <div className="font-mono font-bold text-xs text-right w-12">
                          {rider.oddsLabel}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredRiders.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">No riders found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
