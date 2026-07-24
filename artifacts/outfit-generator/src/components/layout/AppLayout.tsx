import React from "react";
import { Link, useLocation } from "wouter";
import { Shirt, Sparkles, Bookmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetWardrobeStats } from "@/hooks/useLocalDB";

interface AppLayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_W = 220; // px — keep in sync with md:left-[220px] in sheet components

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useGetWardrobeStats();

  const wardrobeCount = stats?.byCategory
    ? stats.byCategory
        .filter((c: { category: string }) =>
          ["outfits", "beauty", "toiletries", "essentials"].includes(c.category)
        )
        .reduce((sum: number, c: { count: number }) => sum + c.count, 0)
    : undefined;

  const navItems = [
    { href: "/",         label: "Suitcase", icon: Shirt,    badge: wardrobeCount },
    { href: "/generate", label: "Generate", icon: Sparkles  },
    { href: "/saved",    label: "Saved",    icon: Bookmark  },
    { href: "/account",  label: "Settings", icon: Settings  },
  ];

  return (
    <div className="h-[100dvh] w-full bg-[#f8f9fa] flex flex-row overflow-hidden">

      {/* ── LEFT SIDEBAR (tablet / iPad only — md and above) ───────────────── */}
      <aside
        className="hidden md:flex flex-col shrink-0 bg-white border-r-[3px] border-black h-full"
        style={{ width: SIDEBAR_W }}
      >
        {/* Brand */}
        <div
          className="px-5 pb-5 border-b-[3px] border-black"
          style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}
        >
          <p className="font-display font-bold text-2xl uppercase tracking-tight leading-tight">
            My Garden
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/35 mt-1">
            Digital Wardrobe
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col p-3 gap-1.5 flex-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all duration-200 relative",
                  isActive
                    ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                    : "border-transparent hover:bg-muted hover:border-black/20 active:scale-[0.98]"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0",
                    isActive ? "text-black" : "text-muted-foreground"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={cn(
                    "font-bold text-sm uppercase tracking-wide",
                    isActive ? "text-black" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>

                {/* Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto bg-secondary border-2 border-black text-black text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── MAIN COLUMN ─────────────────────────────────────────────────────── */}
      {/*
        Phone (< md): centered phone frame, bottom nav
        Tablet (md+): flex-1, fills remaining width, no frame, no bottom nav
      */}
      <div className="flex-1 flex flex-col md:block min-w-0 h-full overflow-hidden bg-background relative">

        {/* Content area */}
        <main className="flex-1 overflow-y-auto pb-[90px] md:pb-0 h-full relative">
          {children}
        </main>

        {/* ── BOTTOM NAVIGATION (phone only) ─────────────────────────────── */}
        <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t-[3px] border-black p-3 pb-safe z-[40]">
          <ul className="flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  <Link href={item.href} className="flex flex-col items-center gap-1 group">
                    <div
                      className={cn(
                        "p-2.5 rounded-full border-2 transition-all duration-200 ease-spring relative",
                        isActive
                          ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-1"
                          : "bg-transparent border-transparent group-hover:bg-muted group-active:scale-95"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-6 h-6",
                          isActive ? "text-black" : "text-muted-foreground",
                          item.href === "/generate" && isActive ? "animate-pulse" : ""
                        )}
                        strokeWidth={isActive ? 2.5 : 2}
                      />

                      {/* Badge */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <div className="absolute -top-2 -right-2 bg-secondary text-black text-[10px] font-bold border-2 border-black w-5 h-5 flex items-center justify-center rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                          {item.badge > 99 ? "99+" : item.badge}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider transition-colors",
                        isActive ? "text-black" : "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
