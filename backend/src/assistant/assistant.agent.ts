import { GoogleGenerativeAI } from "@google/generative-ai";
import { isLlmConfigured } from "../agents/llm.client.js";
import {
  ASSISTANT_TOOL_DECLARATIONS,
  WRITE_TOOLS,
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

export type PendingAction = {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  preview?: unknown;
};

export type UiAction = {
  type: "navigate" | "export_audit";
  tab?: string;
  filter?: string;
  assignedOnly?: boolean;
  caseId?: string;
  filename?: string;
  data?: unknown;
};

export type AssistantChatResult = {
  reply: string;
  cases: AssistantCaseCard[];
  suggestions: string[];
  model: string | null;
  toolsUsed: string[];
  pendingActions?: PendingAction[];
  uiActions?: UiAction[];
};

const TOOL_CATALOG = ASSISTANT_TOOL_DECLARATIONS.map((t) => {
  const props = (t.parameters as { properties?: Record<string, unknown> }).properties ?? {};
  const required = (t.parameters as { required?: string[] }).required ?? [];
  return `- ${t.name}: ${t.description} args=${JSON.stringify({ properties: Object.keys(props), required })}`;
}).join("\n");

const SYSTEM_PROMPT = `You are **RakshaPay**, the merchant AI revenue-recovery agent inside the RakshaPay dashboard.

Personality:
- Warm, sharp, concise, action-oriented.
- **Language rule (strict):** Reply in the same language as the merchant's latest message.
  - Hindi/Hinglish question → Hindi/Hinglish reply.
  - English question → English reply.
- Never invent case IDs, amounts, or metrics. Always use tools for live facts.
- If data is empty, say so and suggest a demo (escalate is best for review flow).

Product knowledge:
- Flow: payment.failed → AI diagnose → strategy → policy → Razorpay link → payment.captured → RECOVERED.
- Policy: above requireHumanAbove → ESCALATE; above maxRecoveryAmount → REJECT.
- Review flow: ESCALATED cases must be **assigned** before Approve/Reject on the Review page.
- Prefer: assign cases to the merchant, then tell them to open Review and Approve. Only call review_case approve/reject if they explicitly ask you to approve/reject.

Actions you can take (tools):
- Read: get_dashboard_summary, list_cases, list_unassigned_escalated, list_my_assigned, get_case_detail, get_policy, get_audit_events, simulate_policy, get_research_metrics, export_audit
- UI (instant, no confirm): navigate_ui (open Cases/Review/Audit/etc; filter=ASSIGNED for my assigned)
- Write (MUST request confirmation first by calling WITHOUT confirmed=true): assign_case, assign_all_unassigned_escalated, review_case, bulk_review, reassign_case, unassign_case, run_demo, update_policy, simulate_capture, resend_payment_link
- When a write tool returns needsConfirmation=true, explain the plan briefly and tell the merchant to press Confirm in the UI (or say "confirm"). Do NOT claim the action already happened.
- After confirmation, the UI will execute with confirmed=true.
- Prefer assign → human Approves on Review. Use bulk_review / review_case only if they explicitly ask.
- Notify SMS/Email toggles → update_policy notifyCustomerSms / notifyCustomerEmail.

Common intents:
- "assign escalated cases to me" → list_unassigned_escalated then assign_all_unassigned_escalated
- "show my assigned" → list_my_assigned then navigate_ui tab=cases filter=ASSIGNED (or review)
- "open review" → navigate_ui tab=review
- "simulate capture on case X" → simulate_capture
- "resend payment link" → resend_payment_link
- "export audit" → export_audit
- "run escalate demo" → run_demo scenario=escalate
- "raise human threshold to 40000" → update_policy requireHumanAbove=40000
- "turn off SMS notify" → update_policy notifyCustomerSms=false

Tool protocol (critical — no native function roles):
- If you need data or want to propose an action, reply with ONLY JSON:
  {"tool_calls":[{"name":"tool_name","args":{...}}]}
- After tool results, answer in natural language.
- Never invent tool results.

Response style:
- Short paragraphs or tight bullets.
- Use ₹ formatting.
- Mention short case id suffix when relevant.

Available tools:
${TOOL_CATALOG}`;

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
    } else if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if ("id" in obj && "status" in obj) push(obj);
      if (Array.isArray(obj.cases)) {
        for (const row of obj.cases) {
          if (row && typeof row === "object" && "id" in row && "status" in row) {
            push(row as Record<string, unknown>);
          }
        }
      }
      if (obj.case && typeof obj.case === "object" && "id" in (obj.case as object)) {
        push(obj.case as Record<string, unknown>);
      }
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
  merchantName?: string;
}): Promise<AssistantChatResult> {
  const message = params.message.trim();
  const merchantName = (params.merchantName ?? "").trim() || process.env.MERCHANT_NAME || "Demo Merchant";
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
      systemInstruction: `${SYSTEM_PROMPT}\n\nLogged-in merchant display name: ${merchantName}. Prefer assigning cases to this name.`,
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
    const pendingActions: PendingAction[] = [];
    const uiActions: UiAction[] = [];

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
        const enrichedArgs = { ...call.args };
        if (
          WRITE_TOOLS.has(call.name) &&
          !enrichedArgs.assignedTo &&
          (call.name === "assign_case" ||
            call.name === "assign_all_unassigned_escalated" ||
            call.name === "reassign_case" ||
            call.name === "list_my_assigned")
        ) {
          enrichedArgs.assignedTo = merchantName;
        }
        if (
          (call.name === "review_case" || call.name === "bulk_review") &&
          !enrichedArgs.reviewedBy
        ) {
          enrichedArgs.reviewedBy = merchantName;
        }
        if (call.name === "list_my_assigned" && !enrichedArgs.assignedTo) {
          enrichedArgs.assignedTo = merchantName;
        }
        const output = await executeAssistantTool(call.name, enrichedArgs);
        toolPayloads.push(output);
        bundle.push({ name: call.name, args: enrichedArgs, result: output });

        if (
          output &&
          typeof output === "object" &&
          (output as { needsConfirmation?: boolean }).needsConfirmation === true
        ) {
          const p = output as {
            tool: string;
            args: Record<string, unknown>;
            summary: string;
            preview?: unknown;
          };
          pendingActions.push({
            tool: p.tool,
            args: p.args,
            summary: p.summary,
            preview: p.preview,
          });
        }

        if (
          output &&
          typeof output === "object" &&
          (output as { uiAction?: UiAction }).uiAction
        ) {
          uiActions.push((output as { uiAction: UiAction }).uiAction);
        }
      }

      // Stop after proposing write confirmations — don't pretend they executed
      if (pendingActions.length) {
        result = await chat.sendMessage(
          `Tool results include pending confirmations. Explain the plan briefly and tell the merchant to press Confirm in the UI. Do NOT say the write action is done yet.\n\n${JSON.stringify(bundle, null, 2)}`
        );
        text = result.response.text()?.trim() ?? "";
        break;
      }

      result = await chat.sendMessage(
        `Tool results (use these facts; do not invent). Now answer the merchant in natural language.\n\n${JSON.stringify(bundle, null, 2)}`
      );
      text = result.response.text()?.trim() ?? "";
    }

    // If model still returned tool JSON (and no pending), force a final answer
    if (!pendingActions.length && parseToolCalls(text)) {
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
        : pendingActions.length
          ? prefersHindi(message)
            ? `Plan ready hai. Confirm dabao: ${pendingActions.map((p) => p.summary).join(" · ")}`
            : `Ready when you are. Press Confirm: ${pendingActions.map((p) => p.summary).join(" · ")}`
          : prefersHindi(message)
            ? "Data mil gaya, lekin jawab generate nahi ho paya. Dobara try karo."
            : "I got the data, but couldn't format the answer. Please try again.";

    let finalCases = extractCaseCards(toolPayloads);
    if (!finalCases.length && /case|recover|escalat|reject|diagnos|assign/i.test(message + reply)) {
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
      pendingActions: pendingActions.length ? pendingActions : undefined,
      uiActions: uiActions.length ? uiActions : undefined,
    };
  } catch (err) {
    console.warn("Assistant Gemini path failed — using live-data fallback:", err);
    return deterministicFallback(message);
  }
}

/** Execute a previously proposed write tool with confirmed=true */
export async function confirmAssistantAction(params: {
  tool: string;
  args: Record<string, unknown>;
}): Promise<{ ok: boolean; result: unknown; reply: string; uiActions?: UiAction[] }> {
  const tool = String(params.tool ?? "").trim();
  const args = { ...(params.args ?? {}), confirmed: true };
  const result = await executeAssistantTool(tool, args);
  const ok =
    !!result &&
    typeof result === "object" &&
    !(result as { error?: string }).error &&
    !(result as { needsConfirmation?: boolean }).needsConfirmation;

  const message =
    result && typeof result === "object" && "message" in result
      ? String((result as { message?: string }).message ?? "")
      : "";

  const uiAction =
    result && typeof result === "object"
      ? (result as { uiAction?: UiAction }).uiAction
      : undefined;

  return {
    ok,
    result,
    reply: ok
      ? message || `Done: ${tool}`
      : String((result as { error?: string })?.error ?? `Could not complete ${tool}`),
    uiActions: uiAction ? [uiAction] : undefined,
  };
}
