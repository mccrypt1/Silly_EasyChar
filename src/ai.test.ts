import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCard } from "./card";
import { extractJson, runAi } from "./ai";

afterEach(() => vi.unstubAllGlobals());

describe("Ollama result handling", () => {
  it("extracts JSON from a fenced response", () => {
    expect(extractJson('```json\\n{"suggestions":["Test"]}\\n```').suggestions).toEqual(["Test"]);
  });

  it("automatically retries an incomplete alternate greeting", async () => {
    const complete = `Hallo {{user}}! ${"Ausführlicher Rollenspieleinstieg. ".repeat(22)}`;
    const invoke = vi.fn()
      .mockResolvedValueOnce('{"fields":{"alternate_greeting:0":"Kurz {{user}}"}}')
      .mockResolvedValueOnce(JSON.stringify({ fields: { "alternate_greeting:0": complete } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.alternate_greetings = ["Idee"];
    const result = await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "edit", card,
      selected: ["alternate_greeting:0"], instruction: "ausarbeiten", language: "Deutsch", nsfw: false
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.fields?.["alternate_greeting:0"]).toBe(complete);
  });
  it("requires SillyTavern dialogue blocks while preserving an existing field language", async () => {
    const dialogue = [1, 2, 3].map(index =>
      `<START>\n{{user}}: "Question ${index}?"\n{{char}}: *She considers it carefully.* "${"Detailed English character response. ".repeat(7)}"`
    ).join("\n");
    const invoke = vi.fn().mockResolvedValue(JSON.stringify({ fields: { mes_example: dialogue } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.mes_example = "<START>\n{{user}}: Hello\n{{char}}: Hello there.";
    await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "edit", card,
      selected: ["mes_example"], instruction: "Improve the examples", language: "Deutsch", nsfw: false
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("Preserve the existing language");
    expect(request.prompt).toContain("3–5 separate <START> blocks");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("asks Ollama to choose contextual lorebook activation settings", async () => {
    const invoke = vi.fn().mockResolvedValue('{"lorebook":{"entries":{}}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "lorebook",
      card: emptyCard(), selected: [], instruction: "", language: "Deutsch", nsfw: true
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("Choose settings per entry");
    expect(request.prompt).toContain("position 0 for general world facts");
    expect(request.prompt).toContain("Probability should normally be 100");
    expect(request.prompt).toContain("Depth matters only at position 4");
  });

  it("normalizes an incomplete grading response instead of reading an undefined findings length", async () => {
    const invoke = vi.fn().mockResolvedValue('{"score":{"total":70,"structure":14,"coherence":14,"roleplay":14,"creativity":14,"polish":14}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const result = await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "grade",
      card: emptyCard(), selected: [], instruction: "", language: "Deutsch", nsfw: true
    });
    expect(result.score?.findings).toEqual([]);
  });

  it("uses a focused payload and field-specific rules for token optimization", async () => {
    const invoke = vi.fn().mockResolvedValue('{"fields":{"scenario":"A compact scenario."}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.scenario = "Original scenario";
    card.data.post_history_instructions = "PRIVATE_LARGE_UNUSED_FIELD";
    await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "optimize",
      card, selected: ["scenario"], instruction: "", language: "Deutsch", nsfw: true
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("Scenario should be 1–2 sentences");
    expect(request.prompt).toContain("Original scenario");
    expect(request.prompt).not.toContain("PRIVATE_LARGE_UNUSED_FIELD");
  });
});

