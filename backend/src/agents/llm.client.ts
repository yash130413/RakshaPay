import { GoogleGenerativeAI } from "@google/generative-ai";
import type { z } from "zod";

const DEFAULT_MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 30_000;

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

/**
 * Gemini structured JSON call with Zod validation.
 * Returns null on missing key, timeout, parse, or validation errors.
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

  const modelName = process.env.LLM_MODEL ?? DEFAULT_MODEL;

  try {
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: params.systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const generatePromise = model.generateContent({
      contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
    });

    const result = await Promise.race([
      generatePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini request timed out")), TIMEOUT_MS)
      ),
    ]);

    const text = result.response.text();
    if (!text) return null;

    const parsed = extractJson(text);
    const validated = params.schema.safeParse(parsed);
    if (!validated.success) {
      console.warn("Gemini JSON validation failed:", validated.error.flatten());
      return null;
    }

    return { data: validated.data, model: modelName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Gemini call failed:", message);
    return null;
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY);
}
