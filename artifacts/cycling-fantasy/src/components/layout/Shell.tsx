import { useLocation } from "wouter";
import { Link } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { 
  Users, 
  Map, 
  Trophy, 
  Activity, 
  ShieldCheck, 
  LogOut,
  Menu,
  X,
  Bike
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ShellProps {
  children: React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: Activity },
    { name: "My Team", href: "/team", icon: Users },
    { name: "Stages", href: "/stages", icon: Map },
    { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    { name: "My Points", href: "/points", icon: Activity },
  ];

  if (user?.isAdmin) {
    navigation.push({ name: "Admin", href: "/admin", icon: ShieldCheck });
  }

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground font-bold"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-card px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Bike className="h-6 w-6 text-primary" />
          <span className="font-heading text-lg font-bold">TDF Fantasy</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-muted-foreground hover:text-foreground"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-30 bg-background md:hidden">
          <nav className="flex flex-col gap-2 p-4">
            <NavLinks onClick={() => setMobileMenuOpen(false)} />
            <div className="mt-8 border-t pt-4">
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Bike className="h-6 w-6 text-primary" />
          <span className="font-heading text-xl font-bold uppercase tracking-wider text-foreground">
            TDF Fantasy
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6">
          <nav className="flex flex-col gap-1 px-3">
            <NavLinks />
          </nav>
        </div>
        
        <div className="border-t p-4">
          <div className="mb-4 flex items-center gap-3 px-2">
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold">
              {user?.firstName?.[0] || user?.email?.[0] || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{user?.firstName || "User"}</span>
              <span className="text-xs text-muted-foreground truncate w-32">{user?.email}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
