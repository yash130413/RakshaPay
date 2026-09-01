import type { Decision } from "./types";

export function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortDate(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function agentSource(decisions?: Decision[]) {
  const src = decisions?.map((d) => d.rawJson?.source ?? d.agent).filter(Boolean);
  if (!src?.length) return null;
  if (src.some((s) => String(s).includes("gemini"))) return "gemini";
  if (src.some((s) => String(s).includes("rules"))) return "rules";
  return null;
}
