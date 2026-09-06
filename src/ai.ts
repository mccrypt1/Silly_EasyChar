import type { AiResult, CharacterCard, CoreEditableField, EditableField } from "./types";
import { normalizePlaceholders } from "./card";

declare global { interface Window { __TAURI__?: { core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } } } }

const fieldLabels: Record<CoreEditableField, string> = {
  name: "Character Name", description: "Description / physical identity and background", personality: "Personality",
  scenario: "Scenario", first_mes: "First Message", mes_example: "Message Examples", creator_notes: "Creator Notes",
  system_prompt: "System Prompt", post_history_instructions: "Post-History Instructions"
};

function fieldLabel(field: EditableField): string {
  if (field.startsWith("alternate_greeting:")) {
    return `Alternate Greeting ${Number(field.split(":")[1]) + 1}`;
  }
  return fieldLabels[field as CoreEditableField];
}

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
Always write the literal placeholders {{char}} and {{user}}. Never output bare User/user or Char/char when referring to them. In German, placeholders behave like proper names: never put articles before them. Write "mit {{user}}", "an {{user}}" and "{{user}} geht", never "mit dem {{user}}", "an den {{user}}" or "der {{user}} geht". Apply the same rule to {{char}}. Never write dialogue, thoughts, feelings, or decisions for {{user}}. Maintain internal consistency.
Keep content in its correct injection layer: system core 0–100; world info before 101–200; character definition 201–300; behavioral rules 301–400; character-specific lore 401–500; persona 501–600; example dialogue 601–700; chat history 701–800; post-instructions 801–900.
Return ONLY strict, parseable JSON with double-quoted property names and escaped line breaks. Never use markdown fences, comments, trailing commas, or single-quoted JSON.`;
  const selected = args.selected.map(f => `${f} (${fieldLabel(f)})`).join(", ");
  const payload = JSON.stringify(args.card.data);
  let task = "";
  if (args.action === "translate") task = `Translate ONLY these fields to ${args.language}: ${selected}. Preserve placeholders, markdown, line breaks, names, and meaning. Return {"fields":{"field":"translation"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "edit") task = `Edit ONLY these fields: ${selected}. User request: ${args.instruction || "Improve quality, clarity, consistency, and roleplay utility."}
Create substantially expanded, complete replacements in one pass instead of merely appending a few sentences. Unless the user requests brevity, aim for roughly 500–1200 characters each for description/personality/scenario, 600–1600 for first_mes, and 3–5 varied exchanges for mes_example. Keep the name concise. Use all useful facts already present, add fitting detail without contradictions, and distribute information into its semantically correct field; never stuff personality, scenario, examples, or instructions into description.
Preserve the existing language of each non-empty source field. The configured output language applies only to explanations and newly created empty fields. Never translate an edited field unless the user explicitly requests translation.
For alternate greetings, return each exact dynamic key such as "alternate_greeting:0" separately. Each alternate greeting must be a complete 600–1600 character roleplay opening with atmosphere, visible action, a distinct situation, a clear conversation hook, and at least one natural {{user}} reference; never decide {{user}}'s response or actions. Return {"fields":{"field":"complete replacement"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "edit" && args.selected.includes("mes_example")) task += ` Every separate dialogue example must begin with <START> on its own line, followed by at least one {{user}}: message and one {{char}}: message. Use the literal prefixes exactly, create 3–5 separate <START> blocks, and demonstrate the character voice, mannerisms, actions, and emotional range. Never use User:, Char:, character names, or one continuous block as speaker prefixes.`;
  if (args.action === "suggest") task = `Review the card and return 3–7 concrete improvements as {"suggestions":["..."],"explanation":"..."} in ${args.language}. Do not rewrite fields.`;
  if (args.action === "grade") task = `Grade the card out of 100. Return {"score":{"total":0,"structure":0,"coherence":0,"roleplay":0,"creativity":0,"polish":0,"findings":["specific actionable improvement", "..."]}}. Each subscore is 0–20 and must sum to total. Findings must be concrete editing instructions in ${args.language}, ready to paste into an editing request. Check correct field placement, placeholders, depth, consistency, user agency, and dialogue examples especially carefully.`;
  if (args.action === "lorebook") task = `Create a production-ready SillyTavern lorebook from the card and this request: ${args.instruction || "Extract important characters, locations, items, factions and rules."} Return {"lorebook":{"entries":{"0":{...}}}}. Each entry MUST contain uid,key,keysecondary,comment,content,constant,selective,selectiveLogic,addMemo,order,position,disable,probability,useProbability,depth,delay,cooldown,sticky,vectorized,ignoreBudget,excludeRecursion,preventRecursion. Use string keys matching uid. Every content block must be concise, standalone and contain only information that should enter the prompt; do not repeat ordinary card fields. Split unrelated concepts. Choose settings per entry: position 0 for general world facts before the character definition, position 1 for character-specific lore after it, positions 5 or 6 only for genuine example-message material, and position 4 only for a deliberately persistent in-chat instruction. Higher order means closer to the end of context and more influence. Use constant true only for essential information that must always load; otherwise provide specific primary trigger keys. Use secondary keys with selective true only to disambiguate broad primary keys. Probability should normally be 100 and lower only for intentionally random content. Depth matters only at position 4. Prevent or exclude recursion only when activation chains would be noisy or unsafe. Set vectorized false and useProbability true. Output language: ${args.language}.`;
  const text = await chat(args.baseUrl, args.model, common, `${task}\n\nCARD DATA:\n${payload}`);
  let result: AiResult;
  try {
    result = normalizeResult(extractJson(text));
  } catch {
    const repaired = await chat(
      args.baseUrl,
      args.model,
      "You are a strict JSON repair utility. Return only valid JSON with double-quoted keys and escaped control characters. Preserve all content and the original object structure.",
      `Repair this malformed model response into valid JSON. Do not summarize or omit content:\n\n${text}`
    );
    try {
      result = normalizeResult(extractJson(repaired));
    } catch {
      throw new Error("Das Modell lieferte zweimal ungültiges JSON. Bitte erneut versuchen oder ein anderes Modell wählen.");
    }
  }
  const wantsBrief = /\b(kurz|knapp|short|brief|concise)\b/iu.test(args.instruction);
  if (args.action === "edit" && !wantsBrief) {
    const incomplete = args.selected.filter(field => {
      const minimum = field.startsWith("alternate_greeting:") || field === "first_mes" ? 600
        : ["description", "personality", "scenario", "mes_example"].includes(field) ? 500 : 0;
      const value = result.fields?.[field] ?? "";
      const dialogueComplete = field !== "mes_example" || (
        (value.match(/<START>/g) ?? []).length >= 3 &&
        value.includes("{{user}}:") && value.includes("{{char}}:")
      );
      return minimum > 0 && (value.length < minimum || !dialogueComplete || (field.startsWith("alternate_greeting:") && !value.includes("{{user}}")));
    });
    if (incomplete.length) {
      const retry = await chat(
        args.baseUrl, args.model, common,
        `The previous result was too short or incomplete for these fields: ${incomplete.map(fieldLabel).join(", ")}. Rewrite ONLY those exact keys as complete replacements. Each description/personality/scenario/mes_example must contain at least 500 characters; each first message or alternate greeting at least 600 characters. Every alternate greeting must naturally include {{user}}. Message examples require 3–5 separate blocks; each begins with <START> and contains literal {{user}}: and {{char}}: prefixes. Preserve the source field language unless translation was explicitly requested. Return strict JSON as {"fields":{"exact_key":"complete replacement"},"explanation":"..."}.\n\nPREVIOUS RESULT:\n${JSON.stringify(result)}\n\nCARD DATA:\n${payload}`
      );
      try {
        const expanded = normalizeResult(extractJson(retry));
        result.fields = { ...result.fields, ...expanded.fields };
        result.explanation = expanded.explanation ?? result.explanation;
      } catch { /* Keep the valid first result if the depth retry fails. */ }
    }
  }
  return result;
}
