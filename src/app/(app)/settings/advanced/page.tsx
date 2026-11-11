"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BarChart3 } from "lucide-react";
import { Tabs } from "@/components/ui";
import { Audit, Retention, Team, Trouble } from "@/components/settings/activity";
import { DemoLab } from "@/components/settings/demo-lab";

const TABS = [
  { id: "activity", label: "Activity log" },
  { id: "demo", label: "Practice sandbox" },
  { id: "team", label: "Team" },
  { id: "data", label: "Data & backups" },
  { id: "trouble", label: "Troubleshooting" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AdvancedPage() {
  return (
    <Suspense>
      <Advanced />
    </Suspense>
  );
}

function Advanced() {
  const sp = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) ?? "activity");
  useEffect(() => {
    const t = sp.get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [sp]);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Advanced</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">Everything under the hood: a full history of actions, the practice sandbox for testing tricky situations, your team, data retention and troubleshooting.</p>
      </div>
      <Link href="/insights" className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] transition-colors hover:border-line-strong">
        <BarChart3 className="size-4 text-accent" aria-hidden />
        <span className="flex-1"><span className="font-medium">Reports</span> <span className="text-muted">· response times, approvals, edits, sales and experiments</span></span>
        <ArrowRight className="size-4 text-faint" />
      </Link>
      <Tabs tabs={TABS as unknown as { id: Tab; label: string }[]} value={tab} onChange={(t) => { setTab(t); router.replace(`/settings/advanced?tab=${t}`, { scroll: false }); }} />
      <div className="animate-fade-in">
        {tab === "activity" && <Audit />}
        {tab === "demo" && <DemoLab />}
        {tab === "team" && <Team />}
        {tab === "data" && <Retention />}
        {tab === "trouble" && <Trouble />}
      </div>
    </div>
  );
}
