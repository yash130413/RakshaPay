import { useEffect, useRef, useState } from "react";
import { ChevronDown, PlayCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DemoScenario } from "@/lib/types";

const DEMO_OPTIONS: {
  scenario: DemoScenario;
  label: string;
  hint: string;
  accent: "recovery" | "neutral" | "escalate" | "reject";
  featured?: boolean;
}[] = [
  {
    scenario: "full_recovery",
    label: "Full recovery loop",
    hint: "Fail → AI → policy → execute → capture → RECOVERED",
    accent: "recovery",
    featured: true,
  },
  {
    scenario: "recoverable",
    label: "Recoverable ₹2,499",
    hint: "Loyal customer (8 pays) → AI retry",
    accent: "neutral",
  },
  {
    scenario: "abandoned",
    label: "Abandoned ₹999",
    hint: "Checkout left → payment link",
    accent: "neutral",
  },
  {
    scenario: "mandate_retry",
    label: "Mandate sequencer",
    hint: "Retry day 1 → 3 → 7 then stop",
    accent: "neutral",
  },
  {
    scenario: "b2b_invoice",
    label: "B2B receivable",
    hint: "Overdue invoice → reminders → escalate",
    accent: "escalate",
  },
  {
    scenario: "promise_to_pay",
    label: "Promise-to-pay",
    hint: "Customer promise date → chase when due",
    accent: "neutral",
  },
  {
    scenario: "escalate",
    label: "Escalate ₹30,000",
    hint: "Human review threshold",
    accent: "escalate",
  },
  {
    scenario: "reject",
    label: "Reject ₹60,000",
    hint: "Max recovery amount block",
    accent: "reject",
  },
];

const ACCENT_BAR = {
  recovery: "bg-recovery",
  neutral: "bg-border",
  escalate: "bg-escalate",
  reject: "bg-reject",
} as const;

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

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const featured = DEMO_OPTIONS.filter((o) => o.featured);
  const rest = DEMO_OPTIONS.filter((o) => !o.featured);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="default"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "h-10 gap-2 rounded-xl px-4 shadow-md shadow-recovery/20 transition-all hover:shadow-lg hover:shadow-recovery/25",
          open && "ring-2 ring-recovery/30 ring-offset-2"
        )}
      >
        <PlayCircle className="size-4" strokeWidth={2.25} />
        <span className="font-semibold">{busy ? "Running…" : "Run demo"}</span>
        <ChevronDown
          className={cn("size-4 opacity-80 transition-transform duration-200", open && "rotate-180")}
        />
      </Button>

      {open && (
        <div
          role="menu"
          className="dropdown-pop-in absolute right-0 z-50 mt-2 w-[19rem] origin-top-right rounded-xl border border-border bg-card p-2 shadow-xl shadow-foreground/5"
        >
          <div className="mb-1 flex items-center gap-2 px-2 py-1.5">
            <Sparkles className="size-3.5 text-recovery" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Judge demo paths
            </p>
          </div>

          {featured.map((opt) => (
            <DemoOption
              key={opt.scenario}
              opt={opt}
              busy={busy}
              onRun={() => {
                onRun(opt.scenario);
                setOpen(false);
              }}
            />
          ))}

          <div className="my-1.5 h-px bg-border" />

          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
            Policy scenarios
          </p>

          {rest.map((opt) => (
            <DemoOption
              key={opt.scenario}
              opt={opt}
              busy={busy}
              onRun={() => {
                onRun(opt.scenario);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DemoOption({
  opt,
  busy,
  onRun,
}: {
  opt: (typeof DEMO_OPTIONS)[number];
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={busy}
      onClick={onRun}
      className={cn(
        "group relative flex w-full overflow-hidden rounded-lg text-left transition-colors hover:bg-muted/80 disabled:opacity-50",
        opt.featured && "mb-1 border border-recovery/20 bg-accent/40 hover:bg-accent/60"
      )}
    >
      <span
        className={cn("absolute bottom-2 left-0 top-2 w-1 rounded-r-full", ACCENT_BAR[opt.accent])}
      />
      <span className="flex flex-col gap-0.5 px-3 py-2.5 pl-4">
        <span className="text-sm font-semibold text-foreground">{opt.label}</span>
        <span className="text-xs leading-snug text-muted-foreground">{opt.hint}</span>
      </span>
    </button>
  );
}
