import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { TrendingUp, Zap, Trophy } from "lucide-react";

export default function Landing() {
  const { login } = useAuth();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">

      {/* Top nav */}
      <nav className="z-20 relative flex items-center justify-between px-6 py-4">
        <span className="font-heading font-black text-lg tracking-tight uppercase">
          Velo<span className="text-primary">Fantasy</span>
        </span>
        <Button variant="outline" size="sm" className="font-bold" onClick={login}>
          Log in
        </Button>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary blur-[100px]" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-destructive blur-[100px]" />
        </div>

        <div className="z-10 max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-mono text-primary mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            TOUR DE FRANCE 2026
          </div>

          <h1 className="text-6xl md:text-8xl font-heading font-black tracking-tighter uppercase leading-[0.9]">
            The <span className="text-primary">Bold</span> Win <br /> The Tour
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            A real-time fantasy cycling league that rewards daring strategy.
            Picking favorites is safe. Picking underdogs pays off massively.
          </p>

          <div className="pt-4 flex flex-col items-center gap-3">
            <Button size="lg" className="h-14 px-10 text-lg font-bold" onClick={login}>
              Start Your Team
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have a team?{" "}
              <button
                className="underline underline-offset-2 hover:text-foreground transition-colors font-medium"
                onClick={login}
              >
                Log in here
              </button>
            </p>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="border-t bg-card py-20 px-4 z-10 relative">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-heading font-bold">Odds Multiplier</h3>
            <p className="text-muted-foreground">
              Every rider's base points are multiplied by the square root of their odds.
              An 80/1 breakaway specialist earns nearly 9× the points of a 1.2 favorite.
            </p>
          </div>

          <div className="space-y-4">
            <div className="h-12 w-12 rounded-lg bg-destructive/20 flex items-center justify-center text-destructive">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-heading font-bold">Live Stages</h3>
            <p className="text-muted-foreground">
              Points are calculated as soon as each stage's results are in, so check back
              after the finish line for your updated score. Don't miss the transfer deadline!
            </p>
          </div>

          <div className="space-y-4">
            <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-500">
              <Trophy className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-heading font-bold">Global Leaderboard</h3>
            <p className="text-muted-foreground">
              Compete against cycling obsessives worldwide. 8 riders. 1 captain.
              21 stages to glory. Prove you are the master tactician.
            </p>
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-muted-foreground border-t z-10 relative bg-background">
        Cycling Fantasy Manager &copy; 2026
      </footer>
    </div>
  );
}
