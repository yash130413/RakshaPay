import { GoogleGenerativeAI } from "@google/generative-ai";
import { isLlmConfigured } from "../agents/llm.client.js";
import {
  ASSISTANT_TOOL_DECLARATIONS,
  executeAssistantTool,
  getDashboardSummary,
  getPolicy,
  listCases,
} from "./assistant.tools.js";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantCaseCard = {
  id: string;
  status: string;
  amountInr: number;
  diagnosis: string | null;
  recommendedAction: string | null;
  aiSource: string | null;
  customerEmail?: string | null;
};

export type AssistantChatResult = {
  reply: string;
  cases: AssistantCaseCard[];
  suggestions: string[];
  model: string | null;
  toolsUsed: string[];
};

const TOOL_CATALOG = ASSISTANT_TOOL_DECLARATIONS.map((t) => {
  const props = (t.parameters as { properties?: Record<string, unknown> }).properties ?? {};
  const required = (t.parameters as { required?: string[] }).required ?? [];
  return `- ${t.name}: ${t.description} args=${JSON.stringify({ properties: Object.keys(props), required })}`;
}).join("\n");

const SYSTEM_PROMPT = `You are **RakshaPay**, the merchant AI revenue-recovery assistant inside the RakshaPay dashboard.

Personality:
- Warm, sharp, concise.
- **Language rule (strict):** Reply in the same language as the merchant's latest message.
  - If they write/speak in Hindi or Hinglish → reply in natural Hindi/Hinglish.
  - If they write/speak in English → reply in clear English only.
- Never invent case IDs, amounts, or metrics. Always use tool results for live facts.
- If data is empty, say so clearly and suggest running a demo or waiting for a real payment.failed webhook.

Product knowledge:
- Flow: payment.failed → AI diagnose → strategy → policy guardrails → Razorpay payment link → payment.captured → RECOVERED.
- Policy: amounts above requireHumanAbove escalate; above maxRecoveryAmount reject; AI cannot bypass policy.
- AI Decision = Gemini. Rules fallback = Gemini unavailable, deterministic TypeScript rules used.
- Tabs: Overview, Cases, Review, Audit, Research, Settings, and this RakshaPay assistant.

Tools (live database):
${TOOL_CATALOG}

Tool protocol (critical — no native function roles):
- If you need live data before answering, reply with ONLY this JSON (no markdown fences):
  {"tool_calls":[{"name":"tool_name","args":{...}}]}
- You may include multiple tool_calls.
- After tool results are provided, answer in natural language for the merchant.
- Never invent tool results.

Response style:
- Short paragraphs or tight bullets.
- Use ₹ Indian formatting when quoting money.
- When discussing specific cases, mention short id suffix and status.
- End with 1 helpful next question only when natural (do not always).`;

function getClient() {
  const apiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function modelName() {
  return process.env.LLM_MODEL ?? "gemini-3.6-flash";
}

function extractCaseCards(toolResults: unknown[]): AssistantCaseCard[] {
  const cards: AssistantCaseCard[] = [];
  const seen = new Set<string>();

  const push = (item: Record<string, unknown>) => {
    const id = typeof item.id === "string" ? item.id : null;
    if (!id || seen.has(id)) return;
    seen.add(id);
    cards.push({
      id,
      status: String(item.status ?? "UNKNOWN"),
      amountInr: Number(item.amountInr ?? 0),
      diagnosis: (item.diagnosis as string | null) ?? null,
      recommendedAction: (item.recommendedAction as string | null) ?? null,
      aiSource: (item.aiSource as string | null) ?? null,
      customerEmail:
        item.customer && typeof item.customer === "object"
          ? ((item.customer as { email?: string | null }).email ?? null)
          : null,
    });
  };

  for (const result of toolResults) {
    if (Array.isArray(result)) {
      for (const row of result) {
        if (row && typeof row === "object" && "id" in row && "status" in row) {
          push(row as Record<string, unknown>);
        }
      }
    } else if (result && typeof result === "object" && "id" in result && "status" in result) {
      push(result as Record<string, unknown>);
    }
  }

  return cards.slice(0, 6);
}

const DEFAULT_SUGGESTIONS = [
  "How many cases are there?",
  "What's the recovery rate?",
  "Show escalated cases",
  "What are the policy limits?",
  "What happens if ₹40,000 fails?",
  "Summarize research metrics",
];

function prefersHindi(message: string): boolean {
  if (/[\u0900-\u097F]/.test(message)) return true;
  const lower = message.toLowerCase();
  return /\b(kya|hai|hain|kitne|kitna|batao|dikhao|karo|kaise|kyun|kyu|nahi|mujhe|aaj|poochho|poocho)\b/.test(
    lower
  );
}

type ToolCall = { name: string; args: Record<string, unknown> };

function parseToolCalls(text: string): ToolCall[] | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const calls = (parsed as { tool_calls?: unknown }).tool_calls;
    if (!Array.isArray(calls) || calls.length === 0) return null;

    const out: ToolCall[] = [];
    for (const call of calls) {
      if (!call || typeof call !== "object") continue;
      const name = String((call as { name?: unknown }).name ?? "").trim();
      if (!name) continue;
      const argsRaw = (call as { args?: unknown }).args;
      const args =
        argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw)
          ? (argsRaw as Record<string, unknown>)
          : {};
      out.push({ name, args });
    }
    return out.length ? out : null;
  } catch {
    // Sometimes model prefixes prose — try to find first JSON object
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const nested = JSON.parse(candidate.slice(start, end + 1)) as {
          tool_calls?: unknown;
        };
        if (Array.isArray(nested.tool_calls) && nested.tool_calls.length) {
          return parseToolCalls(JSON.stringify(nested));
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function deterministicFallback(message: string): Promise<AssistantChatResult> {
  const lower = message.toLowerCase();
  const hindi = prefersHindi(message);
  const [summary, policy, cases] = await Promise.all([
    getDashboardSummary(),
    getPolicy(),
    listCases({ limit: 5 }),
  ]);

  let reply = hindi
    ? `Main RakshaPay assistant hoon (AI temporarily unavailable — live data se jawab de raha hoon).\n\n` +
      `• Total cases: **${summary.totalCases}**\n` +
      `• Recovered: **${summary.recoveredCases}** (₹${summary.recoveredInr.toLocaleString("en-IN")})\n` +
      `• Escalated: **${summary.escalatedCases}** · Rejected: **${summary.rejectedCases}**\n` +
      `• Recovery rate: **${summary.recoveryRatePct}%**\n` +
      `• Policy: human review > ₹${policy.requireHumanAbove.toLocaleString("en-IN")}, reject > ₹${policy.maxRecoveryAmount.toLocaleString("en-IN")}`
    : `I'm RakshaPay assistant (AI temporarily unavailable — answering from live data).\n\n` +
      `• Total cases: **${summary.totalCases}**\n` +
      `• Recovered: **${summary.recoveredCases}** (₹${summary.recoveredInr.toLocaleString("en-IN")})\n` +
      `• Escalated: **${summary.escalatedCases}** · Rejected: **${summary.rejectedCases}**\n` +
      `• Recovery rate: **${summary.recoveryRatePct}%**\n` +
      `• Policy: human review > ₹${policy.requireHumanAbove.toLocaleString("en-IN")}, reject > ₹${policy.maxRecoveryAmount.toLocaleString("en-IN")}`;

  if (lower.includes("escalat") || lower.includes("escalate")) {
    const esc = await listCases({ status: "ESCALATED", limit: 5 });
    reply =
      esc.length === 0
        ? hindi
          ? "Abhi koi escalated case nahi hai."
          : "There are no escalated cases right now."
        : `Escalated cases (${esc.length}):\n` +
          esc
            .map(
              (c) =>
                `• ${c.id.slice(-8)} — ₹${c.amountInr.toLocaleString("en-IN")} — ${c.diagnosis ?? "pending"}`
            )
            .join("\n");
    return {
      reply,
      cases: esc.map((c) => ({
        id: c.id,
        status: c.status,
        amountInr: c.amountInr,
        diagnosis: c.diagnosis,
        recommendedAction: c.recommendedAction,
        aiSource: c.aiSource,
        customerEmail: c.customer?.email ?? null,
      })),
      suggestions: DEFAULT_SUGGESTIONS,
      model: null,
      toolsUsed: ["list_cases"],
    };
  }

  if (lower.includes("policy") || lower.includes("limit")) {
    reply =
      `Current merchant policy guardrails:\n` +
      `• Human escalation above ₹${policy.requireHumanAbove.toLocaleString("en-IN")}\n` +
      `• Hard reject above ₹${policy.maxRecoveryAmount.toLocaleString("en-IN")}\n` +
      `• Max blind retries: ${policy.maxRetries}\n` +
      `• Payment links: ${policy.allowPaymentLink ? "allowed" : "blocked"}\n` +
      `• Notify SMS/Email: ${policy.notifyCustomerSms ? "ON" : "OFF"} / ${policy.notifyCustomerEmail ? "ON" : "OFF"}`;
  }

  return {
    reply,
    cases: cases.map((c) => ({
      id: c.id,
      status: c.status,
      amountInr: c.amountInr,
      diagnosis: c.diagnosis,
      recommendedAction: c.recommendedAction,
      aiSource: c.aiSource,
      customerEmail: c.customer?.email ?? null,
    })),
    suggestions: DEFAULT_SUGGESTIONS,
    model: null,
    toolsUsed: ["get_dashboard_summary", "get_policy", "list_cases"],
  };
}

/**
 * Gemini chat using only USER / MODEL roles.
 * Avoids native functionResponse (`role: function`) which gemini-3.6-flash rejects.
 */
export async function runAssistantChat(params: {
  message: string;
  history?: ChatMessage[];
}): Promise<AssistantChatResult> {
  const message = params.message.trim();
  if (!message) {
    return {
      reply: "Ask me about cases, recovery, policy, or a specific payment.",
      cases: [],
      suggestions: DEFAULT_SUGGESTIONS,
      model: null,
      toolsUsed: [],
    };
  }

  if (!isLlmConfigured()) {
    return deterministicFallback(message);
  }

  const client = getClient();
  if (!client) {
    return deterministicFallback(message);
  }

  try {
    const model = client.getGenerativeModel({
      model: modelName(),
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.3,
      },
    });

    const history = (params.history ?? []).slice(-8).map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const toolsUsed: string[] = [];
    const toolPayloads: unknown[] = [];

    let result = await chat.sendMessage(message);
    let text = result.response.text()?.trim() ?? "";
    let guard = 0;

    while (guard < 4) {
      const calls = parseToolCalls(text);
      if (!calls) break;
      guard += 1;

      const bundle: { name: string; args: Record<string, unknown>; result: unknown }[] = [];
      for (const call of calls) {
        toolsUsed.push(call.name);
        const output = await executeAssistantTool(call.name, call.args);
        toolPayloads.push(output);
        bundle.push({ name: call.name, args: call.args, result: output });
      }

      result = await chat.sendMessage(
        `Tool results (use these facts; do not invent). Now answer the merchant in natural language.\n\n${JSON.stringify(bundle, null, 2)}`
      );
      text = result.response.text()?.trim() ?? "";
    }

    // If model still returned tool JSON, force one final answer with whatever we have
    if (parseToolCalls(text)) {
      const [summary, policy, recent] = await Promise.all([
        getDashboardSummary(),
        getPolicy(),
        listCases({ limit: 5 }),
      ]);
      toolPayloads.push(summary, recent);
      result = await chat.sendMessage(
        `Final context:\n${JSON.stringify({ summary, policy, recentCases: recent }, null, 2)}\n\nAnswer the merchant now in natural language only.`
      );
      text = result.response.text()?.trim() ?? "";
      toolsUsed.push("get_dashboard_summary", "get_policy", "list_cases");
    }

    const reply =
      text && !parseToolCalls(text)
        ? text
        : prefersHindi(message)
          ? "Data mil gaya, lekin jawab generate nahi ho paya. Dobara try karo."
          : "I got the data, but couldn't format the answer. Please try again.";

    let finalCases = extractCaseCards(toolPayloads);
    if (!finalCases.length && /case|recover|escalat|reject|diagnos/i.test(message + reply)) {
      const recent = await listCases({ limit: 3 });
      finalCases = recent.map((c) => ({
        id: c.id,
        status: c.status,
        amountInr: c.amountInr,
        diagnosis: c.diagnosis,
        recommendedAction: c.recommendedAction,
        aiSource: c.aiSource,
        customerEmail: c.customer?.email ?? null,
      }));
    }

    return {
      reply,
      cases: finalCases,
      suggestions: DEFAULT_SUGGESTIONS,
      model: modelName(),
      toolsUsed: [...new Set(toolsUsed)],
    };
  } catch (err) {
    console.warn("Assistant Gemini path failed — using live-data fallback:", err);
    return deterministicFallback(message);
  }
}
