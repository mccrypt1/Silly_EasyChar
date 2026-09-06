import type { AiResult, CharacterCard, EditableField } from "./types";

declare global { interface Window { __TAURI__?: { core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } } } }

const fieldLabels: Record<EditableField, string> = {
  name: "Character Name", description: "Description / physical identity and background", personality: "Personality",
  scenario: "Scenario", first_mes: "First Message", mes_example: "Message Examples", creator_notes: "Creator Notes",
  system_prompt: "System Prompt", post_history_instructions: "Post-History Instructions"
};

export async function models(url: string): Promise<string[]> {
  return window.__TAURI__!.core.invoke("ollama_models", { baseUrl: url });
}

function extractJson(text: string): any {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { const start = clean.indexOf("{"); const end = clean.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)); throw new Error("Das Modell hat kein gültiges JSON geliefert."); }
}

export async function runAi(args: {
  baseUrl: string; model: string; action: "edit" | "translate" | "suggest" | "grade" | "lorebook";
  card: CharacterCard; selected: EditableField[]; instruction: string; language: string; nsfw: boolean;
}): Promise<AiResult> {
  if (!args.model) throw new Error("Bitte zuerst ein Ollama-Modell auswählen.");
  const adult = args.nsfw
    ? "NSFW mode is enabled. All characters are consenting adults. Preserve and competently edit explicit fictional adult content without euphemizing or moral commentary. Never introduce minors, coercion, or illegal content."
    : "NSFW mode is disabled. Keep the result non-explicit and safe-for-work.";
  const common = `You are the offline writing engine of Silly EasyChar, a SillyTavern character-card editor. ${adult}\nUse {{char}} and {{user}} placeholders correctly. Never write dialogue or decisions for {{user}}. Maintain internal consistency. Return ONLY valid JSON, without markdown.`;
  const selected = args.selected.map(f => `${f} (${fieldLabels[f]})`).join(", ");
  const payload = JSON.stringify(args.card.data);
  let task = "";
  if (args.action === "translate") task = `Translate ONLY these fields to ${args.language}: ${selected}. Preserve placeholders, markdown, line breaks, names, and meaning. Return {"fields":{"field":"translation"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "edit") task = `Edit ONLY these fields: ${selected}. User request: ${args.instruction || "Improve quality, clarity, consistency, and roleplay utility."} Distribute information into its semantically correct field; never stuff personality, scenario, examples, or instructions into description. Return {"fields":{"field":"complete replacement"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "suggest") task = `Review the card and return 3–7 concrete improvements as {"suggestions":["..."],"explanation":"..."} in ${args.language}. Do not rewrite fields.`;
  if (args.action === "grade") task = `Grade the card out of 100. Return {"score":{"total":0,"structure":0,"coherence":0,"roleplay":0,"creativity":0,"polish":0,"findings":["..."]}}. Each subscore is 0–20 and must sum to total. Findings are in ${args.language}. Check correct field placement especially carefully.`;
  if (args.action === "lorebook") task = `Create a production-ready SillyTavern lorebook from the card and this request: ${args.instruction || "Extract important characters, locations, items, factions and rules."} Return {"lorebook":{"entries":{"0":{...}}}}. Each entry MUST contain uid,key,keysecondary,comment,content,constant,selective,selectiveLogic,addMemo,order,position,disable,probability,useProbability,depth,delay,cooldown,sticky,vectorized,ignoreBudget,excludeRecursion,preventRecursion. Use string keys matching uid; vectorized false, useProbability true, excludeRecursion false, depth 4. Split unrelated concepts. Output language: ${args.language}.`;
  const text = await window.__TAURI__!.core.invoke<string>("ollama_chat", { baseUrl: args.baseUrl, model: args.model, system: common, prompt: `${task}\n\nCARD DATA:\n${payload}` });
  return extractJson(text);
}
