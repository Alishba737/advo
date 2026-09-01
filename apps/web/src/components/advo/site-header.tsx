"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { checkHealth } from "@/lib/api";

/** Sticky app header with brand, nav, and backend health indicator. */
export function SiteHeader() {
  const pathname = usePathname();
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const { ok } = await checkHealth();
      if (active) setHealthy(ok);
    };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          <span className="text-base tracking-tight">ADVO</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
            AI Legal Assistant · Pakistan
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/chat"
            className={cn(
              "rounded-lg px-3 py-1.5 transition-colors hover:bg-muted",
              pathname?.startsWith("/chat") && "bg-muted font-medium"
            )}
          >
            Chat
          </Link>
          <Link
            href="/documents"
            className={cn(
              "rounded-lg px-3 py-1.5 transition-colors hover:bg-muted",
              pathname?.startsWith("/documents") && "bg-muted font-medium"
            )}
          >
            Documents
          </Link>
        </nav>

        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={
            healthy === null
              ? "Checking backend..."
              : healthy
                ? "Backend online"
                : "Backend offline — start the API server"
          }
        >
          <span
            className={cn(
              "size-2 rounded-full",
              healthy === null && "bg-muted-foreground/40",
              healthy === true && "bg-emerald-500",
              healthy === false && "bg-destructive"
            )}
          />
          <span className="hidden sm:inline">
            {healthy === null ? "..." : healthy ? "Online" : "Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
