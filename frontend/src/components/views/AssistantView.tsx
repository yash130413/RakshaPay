import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type ChatRole = "user" | "assistant";

type CaseCard = {
  id: string;
  status: string;
  amountInr: number;
  diagnosis: string | null;
  recommendedAction: string | null;
  aiSource: string | null;
  customerEmail?: string | null;
};

type ChatItem = {
  id: string;
  role: ChatRole;
  content: string;
  cases?: CaseCard[];
};

type AssistantViewProps = {
  onOpenCase?: (caseId: string) => void;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusTone(status: string) {
  if (status === "RECOVERED") return "text-recovery";
  if (status === "ESCALATED") return "text-escalate";
  if (status === "REJECTED") return "text-reject";
  return "text-foreground";
}

function detectUserLang(text: string): "hi-IN" | "en-IN" {
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  const lower = text.toLowerCase();
  const hindiCue =
    /\b(kya|hai|hain|kitne|kitna|batao|dikhao|karo|kaise|kyun|kyu|nahi|nahin|mujhe|mera|meri|aaj|kal|wale|wali|hoon|hun|poochho|poocho|samjha|thik|theek|rupees?|rupaye)\b/.test(
      lower
    );
  return hindiCue ? "hi-IN" : "en-IN";
}

export function AssistantView({ onOpenCase }: AssistantViewProps) {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi — I’m **RakshaPay**, your AI revenue recovery agent. Ask about cases, diagnosis, policy, or recovery rate in Hindi or English. You can also use the mic.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micLang, setMicLang] = useState<"hi-IN" | "en-IN">("en-IN");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<{
    stop: () => void;
    start: () => void;
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onend: (() => void) | null;
  } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(text: string, lang: "hi-IN" | "en-IN") {
    if (!voiceOut || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      text.replace(/\*\*/g, "").replace(/•/g, "").slice(0, 600)
    );
    utter.lang = lang;
    utter.rate = 1.02;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ||
      null;
    if (preferred) utter.voice = preferred;

    window.speechSynthesis.speak(utter);
  }

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;

    const userLang = detectUserLang(text);
    setMicLang(userLang);
    setError(null);
    setInput("");
    const userMsg: ChatItem = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok && data?.error && !data?.reply) {
        throw new Error(data.error);
      }

      const reply = String(
        data.reply ??
          (userLang === "hi-IN" ? "Kuch jawab nahi mila." : "No reply received.")
      );
      const assistantMsg: ChatItem = {
        id: uid(),
        role: "assistant",
        content: reply,
        cases: Array.isArray(data.cases) ? data.cases : [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      speak(reply, userLang);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Assistant offline";
      setError(msg);
      const failText =
        userLang === "hi-IN"
          ? "Backend se connect nahi ho paya. Server check karo aur dobara try karo."
          : "Couldn’t reach the backend. Check the server and try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: failText,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Voice input isn’t supported in this browser — try Chrome or Edge.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition() as NonNullable<typeof recognitionRef.current>;
    recognition.lang = micLang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (ev: unknown) => {
      const event = ev as { results?: { [i: number]: { [j: number]: { transcript?: string } } } };
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInput(transcript);
        void sendMessage(transcript);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setError(null);
    } catch {
      setError("Couldn’t start the mic — check browser permission.");
      setListening(false);
    }
  }

  return (
    <div className="relative flex h-[calc(100svh-8rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:h-[calc(100svh-6.5rem)]">
      {/* Ambient agent field */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(5,150,105,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(14,165,233,0.08),_transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] [background-size:28px_28px]"
      />

      {/* Agent header */}
      <header className="relative z-10 border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-recovery via-recovery to-brand text-white shadow-lg shadow-recovery/25 ring-1 ring-recovery/20">
                <Bot className="size-5" strokeWidth={2.25} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border-2 border-card bg-recovery">
                <span className="size-1.5 animate-pulse rounded-full bg-white" />
              </span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-recovery">
                Autonomous agent
              </p>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Raksha<span className="text-recovery">Pay</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-recovery/25 bg-recovery-muted/50 px-3 py-1.5 text-[11px] font-medium text-recovery-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-recovery" />
              Agent online
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 rounded-full border-border/80 bg-card/90"
              onClick={() => {
                setVoiceOut((v) => {
                  if (v) window.speechSynthesis?.cancel();
                  return !v;
                });
              }}
            >
              {voiceOut ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {voiceOut ? "Voice on" : "Voice off"}
            </Button>
          </div>
        </div>
      </header>

      {/* Conversation */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-2.5",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {m.role === "assistant" && (
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-recovery to-brand text-white shadow-sm">
                  <Bot className="size-3.5" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[min(92%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "rounded-br-md bg-recovery text-white"
                    : "rounded-bl-md border border-border/60 bg-card/95 text-foreground backdrop-blur-sm"
                )}
              >
                {m.role === "assistant" && m.id === "welcome" && (
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-recovery">
                    Agent briefing
                  </p>
                )}
                <p className="whitespace-pre-wrap">{renderMarkdownLite(m.content)}</p>

                {!!m.cases?.length && (
                  <div className="mt-3 space-y-2">
                    {m.cases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onOpenCase?.(c.id)}
                        className="block w-full rounded-xl border border-border/80 bg-background/90 px-3 py-2.5 text-left transition hover:border-recovery/40 hover:bg-recovery-muted/25"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            …{c.id.slice(-8)}
                          </span>
                          <span className={cn("text-[11px] font-bold", statusTone(c.status))}>
                            {c.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-foreground">
                          {formatInr(c.amountInr)}
                          {c.diagnosis ? ` · ${c.diagnosis}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {c.recommendedAction ?? "Action pending"}
                          {c.aiSource ? ` · ${c.aiSource}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2.5 pl-1 text-xs text-muted-foreground">
              <div className="flex size-8 items-center justify-center rounded-xl bg-recovery-muted text-recovery">
                <Loader2 className="size-3.5 animate-spin" />
              </div>
              <span className="flex items-center gap-1">
                RakshaPay is thinking
                <span className="inline-flex gap-0.5">
                  <span className="size-1 animate-bounce rounded-full bg-recovery [animation-delay:0ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-recovery [animation-delay:120ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-recovery [animation-delay:240ms]" />
                </span>
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="relative z-10 border-t border-border/60 bg-card/90 px-3 py-3 backdrop-blur-md sm:px-5 sm:py-4">
          {error && <p className="mb-2 text-[11px] text-reject">{error}</p>}

          <form
            className="flex items-end gap-2 rounded-2xl border border-border/80 bg-background p-2 shadow-inner shadow-slate-900/5"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
            <Button
              type="button"
              size="icon"
              variant={listening ? "default" : "ghost"}
              className={cn(
                "size-10 shrink-0 rounded-xl",
                listening && "bg-reject text-white hover:bg-reject/90"
              )}
              onClick={toggleMic}
              disabled={busy}
              title="Voice input"
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={1}
              placeholder="Message RakshaPay agent…"
              className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
              disabled={busy}
            />

            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-xl bg-recovery text-white shadow-sm shadow-recovery/20 hover:bg-recovery/90"
              disabled={busy || !input.trim()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function renderMarkdownLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
