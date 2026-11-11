"use client";
import { useState } from "react";
import { Button, cn, Dialog, useAction } from "./ui";
import { post } from "@/lib/client";
import { useShell } from "./shell";
import { useTour } from "./tour/tour";

export type ModelMode = "AUTO" | "DRAFT" | "PAUSED" | "MANUAL";
const OPTIONS: { v: "PAUSED" | "DRAFT" | "AUTO"; label: string; hint: string }[] = [
  { v: "PAUSED", label: "Off", hint: "The AI doesn't reply or draft for this model." },
  { v: "DRAFT", label: "Drafts", hint: "The AI writes replies; you approve each one." },
  { v: "AUTO", label: "Auto", hint: "The AI replies by itself, with natural timing. Sensitive messages still come to you." },
];

/** Per-model AI switch: Off / Drafts / Auto. Auto always asks for confirmation. */
export function ModelSwitch({ accountId, name, mode, isSimulated, onChange, size = "md", tourTarget }: { accountId: string; name: string; mode: ModelMode; isSimulated: boolean; onChange: () => void; size?: "sm" | "md"; tourTarget?: string }) {
  const { me, reloadAuto } = useShell();
  const tour = useTour();
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const current = mode === "MANUAL" ? "PAUSED" : mode;
  const set = (v: "PAUSED" | "DRAFT" | "AUTO", confirmed?: boolean) =>
    run(
      "mode",
      async () => {
        const r = await post("/api/automation", { action: "model_mode", accountId, mode: v, confirm: confirmed });
        onChange();
        reloadAuto();
        if (v === "AUTO") tour.signal("auto-on");
        if (v !== "AUTO") tour.signal("auto-off");
        return r;
      },
      v === "AUTO" ? `${name} now replies automatically` : v === "DRAFT" ? `${name}: the AI writes drafts for you to approve` : `${name}: the AI is off`,
    );
  return (
    <>
      <div role="radiogroup" aria-label={`AI for ${name}`} data-tour={tourTarget} className={cn("inline-flex rounded-lg bg-panel-2 p-0.5 ring-1 ring-inset ring-line", busy && "opacity-60")}>
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={current === o.v}
            title={o.hint}
            disabled={me.role !== "OWNER" || !!busy}
            onClick={() => current !== o.v && (o.v === "AUTO" ? setConfirm(true) : set(o.v))}
            className={cn(
              "rounded-md font-medium transition-all duration-150 disabled:cursor-not-allowed",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              current === o.v
                ? o.v === "AUTO"
                  ? "bg-ok/15 text-ok ring-1 ring-inset ring-ok/30"
                  : o.v === "DRAFT"
                    ? "bg-accent/15 text-accent-strong ring-1 ring-inset ring-accent/30"
                    : "bg-panel-3 text-fg ring-1 ring-inset ring-line-strong"
                : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Let the AI reply for ${name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" data-autofocus onClick={() => { setConfirm(false); set("AUTO", true); }}>
              Turn on auto-reply
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
          <li>• The AI answers {name}'s subscribers by itself, in {name}'s personality, after a natural pause.</li>
          <li>• Explicit requests, refunds, complaints, safety issues and anyone asking for a real person always come to you instead.</li>
          <li>• Paid items are only mentioned when a subscriber is interested, and paid messages still need your approval.</li>
          <li>• Every AI-written message carries {name}'s AI disclosure. Other models keep their current setting.</li>
        </ul>
        {isSimulated ? (
          <p className="text-[13px] text-muted">This is a demo model: replies only go to the built-in simulator.</p>
        ) : (
          <p className="text-[13px] text-muted">Make sure this account is allowed to use automated replies under the platform's and provider's terms.</p>
        )}
      </Dialog>
    </>
  );
}
