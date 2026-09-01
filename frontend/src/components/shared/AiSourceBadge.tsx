import { Brain, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { agentSource } from "@/lib/format";
import type { Decision } from "@/lib/types";
import { cn } from "@/lib/utils";

type AiSourceBadgeProps = {
  decisions?: Decision[];
  className?: string;
};

export function AiSourceBadge({ decisions, className }: AiSourceBadgeProps) {
  const source = agentSource(decisions);

  if (!source) {
    return (
      <Badge variant="muted" className={cn("gap-1", className)}>
        <Brain className="size-3" />
        Pending AI
      </Badge>
    );
  }

  if (source === "gemini") {
    return (
      <Badge variant="gemini" className={cn("gap-1", className)}>
        <Sparkles className="size-3" />
        Gemini
      </Badge>
    );
  }

  return (
    <Badge variant="rules" className={cn("gap-1", className)}>
      <Brain className="size-3" />
      Rules fallback
    </Badge>
  );
}
