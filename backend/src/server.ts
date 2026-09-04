import "dotenv/config";
import cors from "cors";
import express from "express";
import { webhookRouter } from "./razorpay/webhook.handler.js";
import { analyticsRouter } from "./analytics/analytics.router.js";
import { recoveryRouter } from "./recovery/recovery.router.js";
import { authRouter } from "./auth/auth.router.js";
import { policyRouter } from "./policy/policy.router.js";
import { assistantRouter } from "./assistant/assistant.router.js";
import { isLlmConfigured } from "./agents/index.js";
import { connectDatabaseWithRetry } from "./db.js";
import { errorHandler } from "./utils/errorHandler.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  })
);

// Razorpay webhooks need raw body for signature verification
app.use(
  "/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  webhookRouter
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "razorrecover-backend",
    principle: "AI decides. Policy controls. Razorpay executes. Webhooks verify.",
    llm: {
      provider: "gemini",
      model: process.env.LLM_MODEL ?? "gemini-3.6-flash",
      configured: isLlmConfigured(),
    },
  });
});

app.use("/api/auth", authRouter);
app.use("/api/policy", policyRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/recovery", recoveryRouter);
app.use("/api/analytics", analyticsRouter);

app.use(errorHandler);

async function start() {
  try {
    await connectDatabaseWithRetry();
  } catch (err) {
    console.error(
      "Could not connect to database. Check DATABASE_URL in backend/.env (Neon project may be paused)."
    );
    console.error(err instanceof Error ? err.message.split("\n")[0] : err);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`RazorRecover API listening on http://localhost:${port}`);
  });
}

void start();
