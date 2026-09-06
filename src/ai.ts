import type { AiResult, CharacterCard, EditableField } from "./types";
import { normalizePlaceholders } from "./card";

declare global { interface Window { __TAURI__?: { core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } } } }

const fieldLabels: Record<EditableField, string> = {
  name: "Character Name", description: "Description / physical identity and background", personality: "Personality",
  scenario: "Scenario", first_mes: "First Message", mes_example: "Message Examples", creator_notes: "Creator Notes",
  system_prompt: "System Prompt", post_history_instructions: "Post-History Instructions"
};

export async function models(url: string): Promise<string[]> {
  return window.__TAURI__!.core.invoke("ollama_models", { baseUrl: url });
}

export function extractJson(text: string): AiResult {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { const start = clean.indexOf("{"); const end = clean.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)); throw new Error("Das Modell hat kein gültiges JSON geliefert."); }
}

function normalizeResult(result: AiResult): AiResult {
  if (result.fields) {
    for (const [field, value] of Object.entries(result.fields)) {
      if (typeof value === "string") result.fields[field as EditableField] = normalizePlaceholders(value);
    }
  }
  if (result.suggestions) result.suggestions = result.suggestions.map(normalizePlaceholders);
  if (result.score?.findings) result.score.findings = result.score.findings.map(normalizePlaceholders);
  return result;
}

async function chat(baseUrl: string, model: string, system: string, prompt: string): Promise<string> {
  return window.__TAURI__!.core.invoke("ollama_chat", { baseUrl, model, system, prompt });
}

export async function runAi(args: {
  baseUrl: string; model: string; action: "edit" | "translate" | "suggest" | "grade" | "lorebook";
  card: CharacterCard; selected: EditableField[]; instruction: string; language: string; nsfw: boolean;
}): Promise<AiResult> {
  if (!args.model) throw new Error("Bitte zuerst ein Ollama-Modell auswählen.");
  const adult = args.nsfw
    ? "NSFW mode is enabled. All characters are consenting adults. Preserve and competently edit explicit fictional adult content without euphemizing or moral commentary. Never introduce minors, coercion, or illegal content."
    : "NSFW mode is disabled. Keep the result non-explicit and safe-for-work.";
  const common = `You are the offline writing engine of Silly EasyChar, a SillyTavern character-card editor. ${adult}
Always write the literal placeholders {{char}} and {{user}}. Never output bare User/user or Char/char when referring to them. Never write dialogue, thoughts, feelings, or decisions for {{user}}. Maintain internal consistency.
Return ONLY strict, parseable JSON with double-quoted property names and escaped line breaks. Never use markdown fences, comments, trailing commas, or single-quoted JSON.`;
  const selected = args.selected.map(f => `${f} (${fieldLabels[f]})`).join(", ");
  const payload = JSON.stringify(args.card.data);
  let task = "";
  if (args.action === "translate") task = `Translate ONLY these fields to ${args.language}: ${selected}. Preserve placeholders, markdown, line breaks, names, and meaning. Return {"fields":{"field":"translation"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "edit") task = `Edit ONLY these fields: ${selected}. User request: ${args.instruction || "Improve quality, clarity, consistency, and roleplay utility."}
Create substantially expanded, complete replacements in one pass instead of merely appending a few sentences. Unless the user requests brevity, aim for roughly 500–1200 characters each for description/personality/scenario, 600–1600 for first_mes, and 3–5 varied exchanges for mes_example. Keep the name concise. Use all useful facts already present, add fitting detail without contradictions, and distribute information into its semantically correct field; never stuff personality, scenario, examples, or instructions into description.
Return {"fields":{"field":"complete replacement"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "suggest") task = `Review the card and return 3–7 concrete improvements as {"suggestions":["..."],"explanation":"..."} in ${args.language}. Do not rewrite fields.`;
  if (args.action === "grade") task = `Grade the card out of 100. Return {"score":{"total":0,"structure":0,"coherence":0,"roleplay":0,"creativity":0,"polish":0,"findings":["specific actionable improvement", "..."]}}. Each subscore is 0–20 and must sum to total. Findings must be concrete editing instructions in ${args.language}, ready to paste into an editing request. Check correct field placement, placeholders, depth, consistency, user agency, and dialogue examples especially carefully.`;
  if (args.action === "lorebook") task = `Create a production-ready SillyTavern lorebook from the card and this request: ${args.instruction || "Extract important characters, locations, items, factions and rules."} Return {"lorebook":{"entries":{"0":{...}}}}. Each entry MUST contain uid,key,keysecondary,comment,content,constant,selective,selectiveLogic,addMemo,order,position,disable,probability,useProbability,depth,delay,cooldown,sticky,vectorized,ignoreBudget,excludeRecursion,preventRecursion. Use string keys matching uid; vectorized false, useProbability true, excludeRecursion false, depth 4. Split unrelated concepts. Output language: ${args.language}.`;
  const text = await chat(args.baseUrl, args.model, common, `${task}\n\nCARD DATA:\n${payload}`);
  try {
    return normalizeResult(extractJson(text));
  } catch {
    const repaired = await chat(
      args.baseUrl,
      args.model,
      "You are a strict JSON repair utility. Return only valid JSON with double-quoted keys and escaped control characters. Preserve all content and the original object structure.",
      `Repair this malformed model response into valid JSON. Do not summarize or omit content:\n\n${text}`
    );
    try {
      return normalizeResult(extractJson(repaired));
    } catch {
      throw new Error("Das Modell lieferte zweimal ungültiges JSON. Bitte erneut versuchen oder ein anderes Modell wählen.");
    }
  }
}
