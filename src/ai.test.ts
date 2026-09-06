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
});

