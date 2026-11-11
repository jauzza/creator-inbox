"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, MessageSquare, Plug, Sparkles } from "lucide-react";
import { useApi } from "@/lib/client";

export type TourData = Record<string, unknown>;

export type TourStep = {
  id: string;
  chapter: "welcome" | "inbox" | "auto" | "ai" | "ppv" | "control" | "done";
  title: string;
  body: ReactNode | ((d: TourData) => ReactNode);
  /** Route to open when the step starts. `routeLoose` accepts any query string on the same path. */
  route?: string | ((d: TourData) => string);
  routeLoose?: boolean;
  /** data-tour attribute of the element to highlight. Omit for a centred card. */
  target?: string;
  placement?: "right" | "left" | "top" | "bottom";
  /** Allow clicks on the highlighted element even without a task. */
  interactive?: boolean;
  /** Something the user does; the step completes when the UI emits `event` (or the route matches `path`). */
  task?: { label: string; event: string; path?: (fullPath: string, d: TourData) => boolean };
  /** A button in the card that performs a real action, then advances. */
  primary?: { label: string; busyLabel?: string; optional?: boolean; run: (d: TourData) => Promise<Partial<TourData> | void> };
  /** Prepare prerequisites when entering (so Back/Skip never leave the user stranded). */
  ensure?: (d: TourData) => Promise<Partial<TourData> | void>;
  /** When the target isn't on screen (e.g. no conversations yet), show this text and a plain Next instead of the task. */
  skipIfMissing?: string;
};

export const CHAPTERS = [
  { id: "welcome", label: "Welcome" },
  { id: "inbox", label: "Inbox" },
  { id: "ai", label: "Your AI" },
  { id: "done", label: "All set" },
] as const;

export const STEPS: TourStep[] = [
  {
    id: "welcome",
    chapter: "welcome",
    route: "/",
    title: "Setup's done. Here's your quick tour",
    body: (
      <>
        <p>Two minutes to show you where everything is: your models, the inbox, the AI controls and the big red stop button.</p>
        <p className="text-xs text-faint">Need a break? Press Esc. The tour continues next time you open the app.</p>
      </>
    ),
  },
  {
    id: "home-models",
    chapter: "welcome",
    route: "/",
    target: "home-status",
    placement: "bottom",
    title: "One card per model",
    body: "Each model has her own AI personality, PPV menu and connection. The card shows what needs you and what's about to be sent.",
  },
  {
    id: "model-switch",
    chapter: "welcome",
    route: "/",
    target: "model-switch",
    placement: "bottom",
    interactive: true,
    title: "Off, Drafts or Auto",
    body: (
      <>
        <p><b>Drafts</b>: the AI writes, you approve every reply. <b>Auto</b>: it replies by itself after a natural pause, and sensitive messages still come to you.</p>
        <p>Tip: start on Drafts for a few days, then switch to Auto once you like what it writes.</p>
      </>
    ),
  },
  {
    id: "stop",
    chapter: "welcome",
    target: "emergency-stop",
    placement: "right",
    interactive: true,
    title: "Your safety button",
    body: "One click stops every send for every model, including messages you type. It's always on screen. You can release it whenever you're ready.",
  },
  {
    id: "nav-inbox",
    chapter: "inbox",
    target: "nav-inbox",
    placement: "right",
    title: "Now the inbox",
    body: "Every subscriber conversation from all your models lives here.",
    task: { label: "click Inbox.", event: "nav-inbox", path: (p) => p.startsWith("/inbox") },
  },
  {
    id: "inbox-list",
    chapter: "inbox",
    route: "/inbox",
    routeLoose: true,
    target: "inbox-list",
    placement: "right",
    title: "All conversations, newest first",
    body: (
      <>
        <p>Use the model buttons at the top to look at one model at a time. <b>Needs you</b> marks chats that need a person; <b>Draft ready</b> marks replies waiting for your approval.</p>
      </>
    ),
  },
  {
    id: "open-convo",
    chapter: "inbox",
    route: "/inbox",
    routeLoose: true,
    target: "first-convo",
    placement: "right",
    title: "Open a conversation",
    body: "Looking is safe: opening a chat doesn't change anything.",
    task: { label: "open a conversation.", event: "open-convo", path: (p) => /[?&]c=/.test(p) },
    skipIfMissing: "No subscriber has written yet. When they do, their chats appear in this list.",
  },
  {
    id: "draft-area",
    chapter: "inbox",
    target: "draft-area",
    placement: "top",
    title: "Where AI replies appear",
    body: (
      <>
        <p>The AI's reply shows up here first, marked <b>Not sent yet</b> or with a countdown when it's on Auto. You can edit it, send it, or stop it. <b>Why this reply?</b> shows what it used.</p>
        <p>If it mentions a paid item, a <b>PPV</b> note appears. Sending the paid message is always your call.</p>
      </>
    ),
    skipIfMissing: "Open any conversation to see its AI reply area.",
  },
  {
    id: "controls",
    chapter: "inbox",
    target: "takeover",
    placement: "bottom",
    title: "Pause or take over a chat",
    body: (
      <>
        <p><b>Pause AI</b> stops the AI in this one chat. <b>Take over</b> means you're handling it personally: waiting AI replies are cancelled until you hand it back.</p>
        <p className="text-xs text-faint">We won't press them now. This is a real conversation.</p>
      </>
    ),
    skipIfMissing: "Inside each conversation you'll find Pause AI and Take over at the top.",
  },
  {
    id: "nav-settings",
    chapter: "ai",
    target: "nav-settings",
    placement: "right",
    title: "Tune each model's AI",
    body: "Personality, PPV menu, timing and connections all live in Settings.",
    task: { label: "click Settings.", event: "nav-settings", path: (p) => p.startsWith("/settings") },
  },
  {
    id: "personality",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-personality",
    placement: "right",
    title: "Change how she sounds",
    body: "Pick a personality or move a slider. Nothing changes for subscribers until you press Save.",
    task: { label: "move a slider or pick a personality.", event: "style-changed" },
  },
  {
    id: "try-style",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ai-try",
    placement: "left",
    title: "Try it before you save",
    body: "The preview answers a sample message with your new settings, next to the current ones. Previews never reach a subscriber.",
    task: { label: "click “Try this style”.", event: "style-tried" },
  },
  {
    id: "ppv-menu",
    chapter: "ai",
    route: "/settings/ai",
    routeLoose: true,
    target: "ppv-menu",
    placement: "top",
    title: "The PPV menu",
    body: "List what each model sells, with exact prices. The AI only mentions these, only when a subscriber is interested, and never re-offers what they already bought.",
  },
  {
    id: "timing",
    chapter: "ai",
    route: "/settings/automation",
    target: "auto-per-model",
    placement: "bottom",
    title: "Auto-reply and timing",
    body: "Switch models between Off, Drafts and Auto here too, and choose how fast replies go out and during which hours.",
  },
  {
    id: "finish",
    chapter: "done",
    route: "/",
    title: "You're all set",
    body: <Finish />,
  },
];

function Finish() {
  const { data } = useApi<any>("/api/onboarding");
  const models = data?.setup.models ?? [];
  const noPpv = models.filter((m: any) => m.ppvItems === 0);
  return (
    <div className="space-y-3">
      <ul className="grid gap-1.5">
        {["Your models and their AI switch", "The inbox and where AI replies appear", "Pausing and taking over a chat", "Personality, PPV menu and timing"].map((l) => (
          <li key={l} className="flex items-center gap-2 text-fg/90">
            <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden /> {l}
          </li>
        ))}
      </ul>
      {(noPpv.length > 0 || (data && !data.setup.aiReady)) && (
        <div className="rounded-lg border border-line-strong bg-panel-2/60 p-3">
          <p className="mb-2 text-xs font-medium text-faint">Worth doing next</p>
          {data && !data.setup.aiReady && <SetupLine done={false} icon={<Sparkles className="size-3.5" />} href="/settings/ai#connection" label="Connect a real AI model (sample replies are basic)" />}
          {noPpv.map((m: any) => (
            <SetupLine key={m.id} done={false} icon={<MessageSquare className="size-3.5" />} href={`/settings/ai?model=${m.id}`} label={`Add ${m.name}'s PPV menu`} />
          ))}
          <SetupLine done={false} icon={<Plug className="size-3.5" />} href="/settings/notifications" label="Get alerts on your phone (optional)" />
        </div>
      )}
      <p className="text-xs text-faint">You can replay this tour any time from “Guided tour”.</p>
    </div>
  );
}

function SetupLine({ done, icon, href, label }: { done: boolean; icon: ReactNode; href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-fg/90 hover:bg-panel-3">
      {done ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <Circle className="size-4 text-faint" aria-hidden />}
      <span className="text-muted">{icon}</span>
      <span className={done ? "text-muted line-through" : undefined}>{label}</span>
    </Link>
  );
}
