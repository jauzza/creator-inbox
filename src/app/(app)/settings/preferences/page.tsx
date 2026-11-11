"use client";
import { useEffect, useState } from "react";
import { Compass, RotateCcw } from "lucide-react";
import { Button, Card, SettingRow, Switch, useToast } from "@/components/ui";
import { useTour } from "@/components/tour/tour";
import { STEPS } from "@/components/tour/steps";

export default function PreferencesPage() {
  const tour = useTour();
  const toast = useToast();
  const [reduced, setReduced] = useState(false);
  const [hideDemo, setHideDemo] = useState(false);
  useEffect(() => {
    setReduced(localStorage.getItem("ci.motion") === "reduced");
    setHideDemo(localStorage.getItem("ci.hideDemo") === "1");
  }, []);
  const done = tour.saved.completed.length;
  const pct = Math.round((Math.min(done, STEPS.length) / STEPS.length) * 100);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Appearance &amp; preferences</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">How the app looks and behaves for you on this device.</p>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent"><Compass className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">Guided tour</p>
            <p className="text-[13px] text-muted">{tour.saved.finished ? "You've finished the tour. Take it again any time." : done ? `You're ${pct}% through. Pick up where you left off, or start over.` : "A 3-minute interactive walkthrough using demo customers."}</p>
            <div className="mt-2.5 h-1 max-w-xs overflow-hidden rounded-full bg-panel-3" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${tour.saved.finished ? 100 : pct}%` }} />
            </div>
          </div>
          <div className="flex gap-2">
            {!tour.saved.finished && done > 0 && <Button onClick={() => tour.start()}>Resume</Button>}
            <Button variant="primary" onClick={() => tour.start({ restart: true })}>
              <RotateCcw className="size-3.5" /> {done || tour.saved.finished ? "Start over" : "Start the tour"}
            </Button>
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <div className="divide-y divide-line px-5">
          <SettingRow title="Reduce motion" description="Turns off animations and transitions. Your device's own setting is always respected too.">
            <Switch label="Reduce motion" checked={reduced} onChange={(v) => { setReduced(v); localStorage.setItem("ci.motion", v ? "reduced" : ""); document.documentElement.dataset.motion = v ? "reduced" : ""; }} />
          </SettingRow>
          <SettingRow title="Hide demo conversations" description="Keep demo customers out of your inbox once you're using a real account. The guided tour still shows its test customer.">
            <Switch label="Hide demo conversations" checked={hideDemo} onChange={(v) => { setHideDemo(v); localStorage.setItem("ci.hideDemo", v ? "1" : ""); }} />
          </SettingRow>
          <SettingRow title="Welcome screen" description="Show the “Explore with a demo / Set up my account” screen on Home again.">
            <Button size="sm" onClick={() => { localStorage.removeItem("ci.welcome.done"); toast("The welcome screen will show next time you open Home", "info"); }}>Show again</Button>
          </SettingRow>
          <SettingRow title="Theme" description="Creator Inbox uses a dark theme designed for long sessions.">
            <span className="text-[13px] text-muted">Dark</span>
          </SettingRow>
        </div>
      </Card>
    </div>
  );
}
