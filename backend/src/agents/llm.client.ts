import { GoogleGenerativeAI } from "@google/generative-ai";
import type { z } from "zod";

/** Only models that Google currently serves for new API keys. */
const DEFAULT_MODEL = "gemini-3.6-flash";
const FALLBACK_MODELS = ["gemini-3.6-flash"];
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

function getClient() {
  const apiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

function modelCandidates(): string[] {
  const primary = process.env.LLM_MODEL ?? DEFAULT_MODEL;
  const extras = (process.env.LLM_FALLBACK_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Drop known-dead model IDs that waste latency with 404s
  const dead = new Set(["gemini-2.5-flash", "gemini-2.0-flash"]);
  const list = [primary, ...extras, ...FALLBACK_MODELS].filter((m) => !dead.has(m));
  return [...new Set(list.length ? list : [DEFAULT_MODEL])];
}

function isRetryable(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("404") || m.includes("no longer available")) return false;
  return (
    m.includes("503") ||
    m.includes("429") ||
    m.includes("high demand") ||
    m.includes("unavailable") ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("fetch failed")
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function callModel(
  client: GoogleGenerativeAI,
  modelName: string,
  systemPrompt: string,
  userPrompt: string
) {
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const generatePromise = model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  });

  return Promise.race([
    generatePromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out")), TIMEOUT_MS)
    ),
  ]);
}

/**
 * Gemini structured JSON call with Zod validation.
 * Retries on 503/429; skips 404 models immediately. Returns null → rules fallback.
 */
export async function generateStructuredJson<T extends z.ZodType>(params: {
  systemPrompt: string;
  userPrompt: string;
  schema: T;
}): Promise<{ data: z.infer<T>; model: string } | null> {
  const client = getClient();
  if (!client) {
    console.warn("LLM_API_KEY missing — skipping Gemini call");
    return null;
  }

  for (const modelName of modelCandidates()) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await callModel(
          client,
          modelName,
          params.systemPrompt,
          params.userPrompt
        );

        const text = result.response.text();
        if (!text) {
          console.warn(`Gemini empty response (${modelName})`);
          break;
        }

        const parsed = extractJson(text);
        const validated = params.schema.safeParse(parsed);
        if (!validated.success) {
          console.warn(
            `Gemini JSON validation failed (${modelName}):`,
            validated.error.flatten()
          );
          break;
        }

        return { data: validated.data, model: modelName };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Gemini call failed (${modelName} attempt ${attempt}/${MAX_RETRIES}):`,
          message
        );

        if (!isRetryable(message)) {
          break;
        }
        if (attempt === MAX_RETRIES) {
          break;
        }
        await sleep(1000 * attempt);
      }
    }
  }

  return null;
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY);
}
