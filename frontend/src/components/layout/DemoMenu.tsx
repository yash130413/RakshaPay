import { useEffect, useRef, useState } from "react";
import { ChevronDown, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DemoScenario } from "@/lib/types";

const DEMO_OPTIONS: { scenario: DemoScenario; label: string; hint: string; variant: "recovery" | "outline" | "escalate" | "reject" }[] = [
  {
    scenario: "full_recovery",
    label: "Full recovery",
    hint: "fail → execute → capture → RECOVERED",
    variant: "recovery",
  },
  {
    scenario: "recoverable",
    label: "Recoverable ₹2,499",
    hint: "AI approve → payment link",
    variant: "outline",
  },
  {
    scenario: "escalate",
    label: "Escalate ₹30,000",
    hint: "Policy human review threshold",
    variant: "escalate",
  },
  {
    scenario: "reject",
    label: "Reject ₹60,000",
    hint: "Policy max amount block",
    variant: "reject",
  },
];

type DemoMenuProps = {
  busy: boolean;
  onRun: (scenario: DemoScenario) => void;
};

export function DemoMenu({ busy, onRun }: DemoMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="default"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="gap-2"
      >
        <PlayCircle className="size-4" />
        Run demo
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-lg">
          <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Policy paths
          </p>
          {DEMO_OPTIONS.map((opt) => (
            <button
              key={opt.scenario}
              type="button"
              disabled={busy}
              onClick={() => {
                onRun(opt.scenario);
                setOpen(false);
              }}
              className="flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
