import { Check, Circle, Minus } from "lucide-react";
import { buildRecoveryFlowSteps, type FlowStepState } from "@/lib/recovery-flow";
import type { RecoveryCase } from "@/lib/types";
import { cn } from "@/lib/utils";

function StepIcon({ state }: { state: FlowStepState }) {
  if (state === "done") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-recovery text-white">
        <Check className="size-3.5" />
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-reject-muted text-reject">
        <Minus className="size-3.5" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-recovery bg-accent">
        <Circle className="size-2 fill-recovery text-recovery" />
      </span>
    );
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full border border-border bg-muted">
      <Circle className="size-2 text-muted-foreground" />
    </span>
  );
}

type RecoveryFlowStepperProps = {
  recoveryCase: RecoveryCase;
};

export function RecoveryFlowStepper({ recoveryCase }: RecoveryFlowStepperProps) {
  const steps = buildRecoveryFlowSteps(recoveryCase);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Recovery flow
      </p>
      <ol className="mt-3 flex items-start justify-between gap-1">
        {steps.map((step, index) => (
          <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div className="relative flex w-full items-center justify-center">
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-1/2 top-3 h-px w-full -translate-y-1/2",
                    steps[index - 1].state === "done" ? "bg-recovery" : "bg-border"
                  )}
                  style={{ width: "100%", left: "-50%" }}
                />
              )}
              <div className="relative z-10">
                <StepIcon state={step.state} />
              </div>
            </div>
            <p
              className={cn(
                "mt-2 text-[10px] font-semibold uppercase tracking-wide",
                step.state === "done" && "text-recovery-foreground",
                step.state === "active" && "text-foreground",
                step.state === "blocked" && "text-reject",
                step.state === "pending" && "text-muted-foreground"
              )}
            >
              {step.label}
            </p>
            {step.detail && (
              <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{step.detail}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
