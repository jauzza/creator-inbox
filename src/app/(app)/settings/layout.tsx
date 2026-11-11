"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, MessageSquare, SlidersHorizontal, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/components/ui";

const SECTIONS = [
  { href: "/settings/ai", label: "AI Assistant", hint: "Personality & knowledge", icon: Sparkles },
  { href: "/settings/accounts", label: "Messaging accounts", hint: "Where messages come from", icon: MessageSquare },
  { href: "/settings/automation", label: "Automation & scheduling", hint: "What the AI may do, and when", icon: Bot },
  { href: "/settings/notifications", label: "Notifications", hint: "How we alert you", icon: Bell },
  { href: "/settings/preferences", label: "Appearance & preferences", hint: "Tour, motion, demo data", icon: SlidersHorizontal },
  { href: "/settings/advanced", label: "Advanced", hint: "Logs, demo lab, team, data", icon: Wrench },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-[22px] font-semibold tracking-[-0.02em]">Settings</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav aria-label="Settings sections" className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:w-56 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map((s) => {
            const active = path.startsWith(s.href);
            return (
              <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined} className={cn("group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 transition-colors lg:items-start", active ? "bg-panel-3 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg")}>
                <s.icon className={cn("size-4 shrink-0 lg:mt-0.5", active ? "text-accent" : "text-faint")} aria-hidden />
                <span>
                  <span className="block whitespace-nowrap text-[13.5px] font-medium">{s.label}</span>
                  <span className="hidden text-[11.5px] text-faint lg:block">{s.hint}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 animate-fade-in">{children}</div>
      </div>
    </div>
  );
}
