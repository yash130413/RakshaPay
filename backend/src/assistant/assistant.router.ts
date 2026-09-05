import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  confirmAssistantAction,
  runAssistantChat,
  type ChatMessage,
} from "./assistant.agent.js";
import { WRITE_TOOLS } from "./assistant.tools.js";

export const assistantRouter = Router();

assistantRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history: ChatMessage[] = rawHistory
      .filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof m === "object" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
          typeof (m as ChatMessage).content === "string"
      )
      .map((m: ChatMessage) => ({
        role: m.role,
        content: m.content.slice(0, 4000),
      }))
      .slice(-8);

    try {
      const result = await runAssistantChat({
        message: message.slice(0, 4000),
        history,
        merchantName: String(req.body?.merchantName ?? "").trim() || undefined,
      });
      return res.json(result);
    } catch (err) {
      console.error("Assistant chat failed:", err);
      const fallback = await runAssistantChat({
        message: "dashboard summary do",
        history: [],
      }).catch(() => null);

      return res.status(200).json({
        reply:
          fallback?.reply ??
          "Assistant temporarily busy hai. Thodi der baad try karo — cases tab se live data dekh sakte ho.",
        cases: fallback?.cases ?? [],
        suggestions: fallback?.suggestions ?? [
          "How many cases are there?",
          "What's the recovery rate?",
          "What are the policy limits?",
        ],
        model: null,
        toolsUsed: fallback?.toolsUsed ?? [],
        error: err instanceof Error ? err.message : "assistant_failed",
      });
    }
  })
);

assistantRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const tool = String(req.body?.tool ?? "").trim();
    const args =
      req.body?.args && typeof req.body.args === "object" && !Array.isArray(req.body.args)
        ? (req.body.args as Record<string, unknown>)
        : {};

    if (!tool || !WRITE_TOOLS.has(tool)) {
      return res.status(400).json({ error: "Invalid or non-writable tool" });
    }

    const result = await confirmAssistantAction({ tool, args });
    return res.json(result);
  })
);
