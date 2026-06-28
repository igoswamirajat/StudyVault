import { useEffect, useState, useRef, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Library as LibraryIcon,
  CalendarDays,
  Play,
  NotebookText,
  BarChart3,
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  LogOut,
  Layers,
  Network,
  Sun,
  Trash2,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { OnboardingDebugPanel, pushOnboardingDecision } from "@/components/common/OnboardingDebug";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAvailabilityFilter, type AvailabilityFilter } from "@/hooks/useContentAvailability";
import { useSettings } from "@/hooks/useSettings";
import { ClientOnly } from "@/components/common/ClientOnly";
import { getAllSettings } from "@/services/storageService";
import { CommandPalette } from "@/components/common/CommandPalette";
import {
  getActiveWorkspaceId,
  getActiveWorkspace,
  clearActiveWorkspace,
  WORKSPACE_CHANGED_EVENT,
} from "@/services/workspaceService";
import { resetDbCache } from "@/db/schema";
import { FocusBox } from "@/components/study/FocusBox";
import { FileSelectionProvider } from "@/hooks/useFileSelection";
import { SelectionToolbar } from "@/components/files/SelectionToolbar";


const PRIMARY_NAV = [
  { to: "/library", label: "Library", icon: LibraryIcon },
  { to: "/organizer", label: "Organizer", icon: CalendarDays },
  { to: "/study", label: "Study Room", icon: Play },
  { to: "/notes", label: "Notes", icon: NotebookText },
] as const;

const SECONDARY_NAV = [
  { to: "/recap", label: "Recap", icon: Sun },
  { to: "/graph", label: "Graph", icon: Network },
  { to: "/flashcards", label: "Cards", icon: Layers },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/trash", label: "Trash", icon: Trash2 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;


const NAV_ITEMS = [...PRIMARY_NAV, ...SECONDARY_NAV] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <FileSelectionProvider>
      <AppShellInner>{children}</AppShellInner>
      <SelectionToolbar />
    </FileSelectionProvider>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isRouterLoading = useRouterState({ select: (s) => Boolean(s.isLoading || s.isTransitioning) });
  const navigate = useNavigate();
  const isOnboarding = pathname.startsWith("/onboarding");
  const isWorkspacePicker = pathname.startsWith("/workspaces");
  const { settings, loaded } = useSettings();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [decisionPending, setDecisionPending] = useState(true);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [wsName, setWsName] = useState("");

  // Track active workspace via storage event (other tabs) + custom event.
  useEffect(() => {
    setActiveWorkspaceId(getActiveWorkspaceId());
    const sync = () => setActiveWorkspaceId(getActiveWorkspaceId());
    window.addEventListener(WORKSPACE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Workspace name for breadcrumb.
  useEffect(() => {
    const refresh = () => setWsName(getActiveWorkspace()?.name ?? "");
    refresh();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Apply user-picked accent color to CSS vars.
  useEffect(() => {
    const accent = (settings.accentColor as string) || "";
    if (!accent) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--sidebar-primary", accent);
    root.style.setProperty("--sidebar-ring", accent);
    root.style.setProperty(
      "--gradient-accent",
      `linear-gradient(135deg, ${accent}, ${accent})`,
    );
  }, [settings.accentColor]);

  // Routing decision:
  //   1. No workspace -> /workspaces
  //   2. Workspace but not initialized -> /onboarding
  //   3. Otherwise stay (root redirects to /library)
  useEffect(() => {
    if (!loaded) {
      setDecisionPending(true);
      return;
    }
    let cancelled = false;
    setDecisionPending(true);

    async function decide() {
      const wsId = getActiveWorkspaceId();

      // No workspace at all → workspace picker.
      if (!wsId) {
        if (!isWorkspacePicker) {
          pushOnboardingDecision({
            pathname,
            initialized: false,
            driveId: null,
            appInitialized: false,
            decision: "→ /workspaces (no active workspace)",
          });
          navigate({ to: "/workspaces" });
        }
        if (!cancelled) setDecisionPending(false);
        return;
      }

      const currentInitialized = Boolean(settings.appInitialized) || Boolean(settings.driveId);
      const latest = currentInitialized ? settings : await getAllSettings();
      const initialized = Boolean(latest.appInitialized) || Boolean(latest.driveId);
      if (cancelled) return;

      let decision = "stay";
      if (!initialized && !isOnboarding && !isWorkspacePicker && pathname !== "/") {
        decision = "→ /onboarding (not initialized)";
        navigate({ to: "/onboarding" });
      } else if (pathname === "/") {
        decision = initialized ? "→ /library (root, initialized)" : "→ /onboarding (root, fresh)";
        navigate({ to: initialized ? "/library" : "/onboarding" });
      } else if (initialized && isOnboarding) {
        decision = "stay on /onboarding (manual visit, initialized)";
      }

      pushOnboardingDecision({
        pathname,
        initialized,
        driveId: (latest.driveId as string | null) ?? null,
        appInitialized: Boolean(latest.appInitialized),
        decision,
      });
      if (!cancelled) setDecisionPending(false);
    }

    void decide();

    return () => {
      cancelled = true;
    };
  }, [loaded, settings.appInitialized, settings.driveId, isOnboarding, isWorkspacePicker, pathname, navigate, activeWorkspaceId]);

  // Hotkey: [ toggles mobile navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "[" && !isInInput(e.target)) {
        setMobileNavOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // --- Pill animation ---
  const tabRefs = useRef(new Map<string, HTMLAnchorElement>());
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [pillPos, setPillPos] = useState({ left: 0, width: 0, opacity: 0 });

  function updatePill(targetPath = pathname) {
    const activeItem = NAV_ITEMS.find(
      (i) => targetPath === i.to || targetPath.startsWith(i.to + "/"),
    );
    if (!activeItem) {
      setPillPos((p) => ({ ...p, opacity: 0 }));
      return;
    }
    const el = tabRefs.current.get(activeItem.to);
    const container = tabsContainerRef.current;
    if (!el || !container) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setPillPos({
      left: elRect.left - containerRect.left + container.scrollLeft,
      width: elRect.width,
      opacity: 1,
    });
  }

  useEffect(() => {
    const timer = setTimeout(() => updatePill(), 80);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    let rafId = 0;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updatePill());
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const activeNavItem = NAV_ITEMS.find(
    (i) => pathname === i.to || pathname.startsWith(i.to + "/"),
  );

  function switchWorkspace() {
    try {
      resetDbCache();
    } catch { /* noop */ }
    clearActiveWorkspace();
    window.location.assign("/workspaces");
  }

  const online = useOnlineStatus();

  if (isWorkspacePicker) {
    return (
      <div className="min-h-screen bg-background">
        {children}
        <RouteLoadingOverlay show={!loaded || isRouterLoading} />
      </div>
    );
  }

  if (isOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
        <RouteLoadingOverlay show={!loaded || decisionPending || isRouterLoading} />
        <OnboardingDebugPanel />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-[#fff]">
        {/* Row 1: 48px */}
        <div
          className="flex h-12 items-center justify-between px-4 sm:px-7"
          style={{ borderBottom: "1px solid #ebebeb" }}
        >
          {/* Left: Logo + breadcrumb */}
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/library"
              className="flex shrink-0 items-center gap-3"
              onClick={() => setMobileNavOpen(false)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#111]" style={{ borderRadius: "4px" }}>
                <div className="h-[18px] w-[18px] bg-[#6C63FF]" style={{ borderRadius: "2px" }} />
              </div>
              <span
                className="whitespace-nowrap text-[14px] font-extrabold uppercase text-[#111]"
                style={{ letterSpacing: "0.08em" }}
              >
                STUDYVAULT
              </span>
            </Link>
            <div className="hidden h-5 shrink-0 bg-[#e5e5e5] sm:block" style={{ width: "1.5px" }} />
            <div className="hidden min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase sm:flex" style={{ letterSpacing: "0.06em" }}>
              {wsName && (
                <>
                  <span className="truncate text-[#888]">{wsName}</span>
                  <span className="text-[#888]">›</span>
                </>
              )}
              <span className="truncate text-[#111]">
                {activeNavItem?.label ?? ""}
              </span>
            </div>
          </div>

          {/* Right: Workspace button + Sign-out */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={switchWorkspace}
              className="hidden items-center gap-2 text-[11px] font-bold uppercase text-[#111] transition-colors hover:bg-[#111] hover:text-white md:inline-flex"
              style={{
                border: "1.5px solid #111",
                borderRadius: "3px",
                padding: "5px 12px",
                letterSpacing: "0.06em",
              }}
              title="Switch workspace"
            >
              <span className="size-2 shrink-0 rounded-full bg-[#f5c842]" />
              <span className="max-w-[120px] truncate">{wsName || "No workspace"}</span>
            </button>
            <button
              type="button"
              onClick={switchWorkspace}
              className="hidden place-items-center text-[#111] transition-colors hover:border-[#111] md:grid"
              style={{
                width: "32px",
                height: "32px",
                border: "1.5px solid #e5e5e5",
                borderRadius: "3px",
              }}
              aria-label="Sign out and switch workspace"
              title="Sign out / switch workspace"
            >
              <LogOut className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="inline-flex items-center border border-[#e5e5e5] px-3 text-[11px] font-bold uppercase text-[#111] md:hidden"
              style={{ borderRadius: "3px", height: "32px", letterSpacing: "0.06em" }}
              aria-label="Toggle navigation"
              aria-expanded={mobileNavOpen}
            >
              Menu
            </button>
          </div>
        </div>

        {/* Row 2: 44px tab strip */}
        <div
          className="flex h-11 items-center justify-between px-4 sm:px-7"
          style={{ borderBottom: "1px solid #ebebeb" }}
        >
          <div
            ref={tabsContainerRef}
            className="relative flex items-center gap-1 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {/* Sliding black pill */}
            <div
              className="absolute top-1.5 bottom-1.5 z-0 bg-[#111]"
              style={{
                left: `${pillPos.left}px`,
                width: `${pillPos.width}px`,
                borderRadius: "2px",
                opacity: pillPos.opacity,
                transition: "left 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  ref={(el) => {
                    if (el) tabRefs.current.set(item.to, el);
                  }}
                  className={cn(
                    "relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-[11px] font-bold uppercase transition-colors",
                    active ? "text-white" : "text-[#777] hover:text-[#111]",
                  )}
                  style={{ letterSpacing: "0.07em" }}
                  onClick={() => {
                    const el = tabRefs.current.get(item.to);
                    const container = tabsContainerRef.current;
                    if (el && container) {
                      const containerRect = container.getBoundingClientRect();
                      const elRect = el.getBoundingClientRect();
                      setPillPos({
                        left: elRect.left - containerRect.left + container.scrollLeft,
                        width: elRect.width,
                        opacity: 1,
                      });
                    }
                  }}
                >
                  <Icon
                    className="size-4 shrink-0"
                    strokeWidth={active ? 2.5 : 2}
                  />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Online status */}
          <ClientOnly>
            <AvailabilityAndStatus online={online} />
          </ClientOnly>
        </div>

        {/* Mobile nav */}
        {mobileNavOpen && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid gap-2 border-b border-[#ebebeb] bg-[#fff] px-4 py-3 sm:grid-cols-2 sm:px-7 md:hidden"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-tight",
                    active
                      ? "bg-[#111] text-white"
                      : "text-[#777] hover:bg-[#f5f5f5] hover:text-[#111]",
                  )}
                  style={{ borderRadius: "2px" }}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </motion.nav>
        )}
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-border px-4 py-4 text-xs font-medium uppercase tracking-widest text-muted-foreground sm:px-7">
        StudyVault · Study Workspace
      </footer>
      <RouteLoadingOverlay show={!loaded || decisionPending || isRouterLoading} />
      <OnboardingDebugPanel />
      <CommandPalette />
      <FocusBox />
    </div>
  );
}

function RouteLoadingOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="route-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 border border-foreground bg-background px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest shadow-[6px_6px_0_var(--foreground)]">
            <span className="size-2 animate-pulse bg-primary" />
            Loading workspace…
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AvailabilityAndStatus({ online }: { online: boolean }) {
  const [filter, setFilter] = useAvailabilityFilter();
  return (
    <div className="hidden shrink-0 items-center gap-3 sm:flex">
      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#888]" style={{ letterSpacing: "0.06em" }}>
        <span className="hidden lg:inline">Show</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as AvailabilityFilter)}
          className="h-7 cursor-pointer border border-[#e5e5e5] bg-white px-1.5 text-[10px] font-bold uppercase text-[#111] hover:border-[#111] focus:outline-none"
          style={{ letterSpacing: "0.06em", borderRadius: "3px" }}
          title="Filter content by availability"
        >
          <option value="both">Both</option>
          <option value="online">Online only</option>
          <option value="offline">Offline only</option>
        </select>
      </label>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-[#888]" style={{ letterSpacing: "0.06em" }}>
        <span
          className="size-2 shrink-0 rounded-full"
          style={{
            backgroundColor: online ? "#22c55e" : "#ef4444",
            animation: online ? "blink 2.2s ease-in-out infinite" : "none",
          }}
        />
        <span>{online ? "Online" : "Offline"}</span>
      </div>
    </div>
  );
}

function isInInput(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
