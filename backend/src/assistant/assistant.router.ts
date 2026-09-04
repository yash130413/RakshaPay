import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { runAssistantChat, type ChatMessage } from "./assistant.agent.js";

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
      });
      return res.json(result);
    } catch (err) {
      console.error("Assistant chat failed:", err);
      // Soft fallback so UI never hard-crashes
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
          "Aaj kitne cases hain?",
          "Recovery rate batao",
          "Policy limits kya hain?",
        ],
        model: null,
        toolsUsed: fallback?.toolsUsed ?? [],
        error: err instanceof Error ? err.message : "assistant_failed",
      });
    }
  })
);
