"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AudioLines,
  BookOpen,
  Bot,
  ChevronRight,
  Cpu,
  Home,
  Library,
  Mic2,
  Moon,
  Settings,
  Sun,
  TerminalSquare,
} from "lucide-react";

const LINKS = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/studio", label: "Text to speech", icon: AudioLines },
  { href: "/voices", label: "Voice library", icon: BookOpen },
  { href: "/clone", label: "Voice cloning", icon: Mic2 },
  { href: "/library", label: "Generations", icon: Library },
];

const SECONDARY_LINKS = [
  { href: "/automate", label: "Developer API", icon: TerminalSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface Status {
  engines: {
    engines: Record<string, { loaded: boolean }>;
    memory: { processMb: number; systemAvailableMb: number };
  };
}

export function Nav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as "dark" | "light") ?? "dark";
    setTheme(current);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/system/status");
        if (alive && res.ok) setStatus(await res.json());
      } catch { /* server restarting */ }
    };
    poll();
    const timer = setInterval(poll, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("vg-theme", next); } catch { /* private mode */ }
  };

  const loaded = status
    ? Object.entries(status.engines.engines)
        .filter(([, engine]) => engine.loaded)
        .map(([name]) => (name === "kokoro" ? "Kokoro" : "Cloning"))
    : [];
  const freeGb = status ? status.engines.memory.systemAvailableMb / 1024 : null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const ThemeButton = () => (
    <button
      onClick={toggleTheme}
      className="icon-btn"
      aria-label="Toggle light or dark theme"
      title="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );

  return (
    <>
      <header className="mobile-nav lg:hidden">
        <Brand />
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...LINKS, ...SECONDARY_LINKS].map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`mobile-nav-link ${isActive(link.href) ? "is-active" : ""}`}
                aria-label={link.label}
                title={link.label}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
        <ThemeButton />
      </header>

      <aside className="sidebar hidden lg:flex">
        <div className="sidebar-brand">
          <Brand />
          <span className="badge badge-brand">Local</span>
        </div>

        <Link href="/studio" className="sidebar-create">
          <Bot size={16} />
          Create audio
          <ChevronRight size={15} className="ml-auto opacity-60" />
        </Link>

        <nav className="mt-5" aria-label="Primary navigation">
          <div className="sidebar-label">Workspace</div>
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`sidebar-link ${isActive(link.href) ? "is-active" : ""}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{link.label}</span>
              </Link>
            );
          })}

          <div className="sidebar-label mt-7">System</div>
          {SECONDARY_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`sidebar-link ${isActive(link.href) ? "is-active" : ""}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="system-card">
            <div className="mb-2 flex items-center gap-2">
              <Cpu size={15} />
              <span className="font-semibold">Local engine</span>
              <span className={`status-dot ${loaded.length ? "is-online" : ""}`} />
            </div>
            <p>
              {loaded.length
                ? `${loaded.join(" + ")} loaded`
                : freeGb !== null
                  ? `${freeGb.toFixed(1)} GB memory available`
                  : "Checking system status"}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-[0.72rem]" style={{ color: "var(--color-ink-faint)" }}>
              Private by default
            </span>
            <ThemeButton />
          </div>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="brand-mark" aria-label="VoiceGen home">
      <span className="brand-icon" aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      <span>VoiceGen</span>
    </Link>
  );
}
