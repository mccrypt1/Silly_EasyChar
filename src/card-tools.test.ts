import { describe, expect, it } from "vitest";
import { emptyCard } from "./card";
import { diffCards, estimateTokens, promptUseFor, restoreCardParts, UndoHistory } from "./card-tools";

describe("card safety tools", () => {
  it("estimates tokens transparently and classifies prompt usage", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(promptUseFor("/data/first_mes")).toBe("Nur beim Start");
    expect(promptUseFor("/dialogue/0")).toBe("Bedingt");
    expect(promptUseFor("/data/system_prompt")).toBe("Dauerhaft");
  });

  it("diffs and restores greetings and dialogue examples independently", () => {
    const snapshot = emptyCard();
    snapshot.data.alternate_greetings = ["Old greeting"];
    snapshot.data.mes_example = "<START>\n{{user}}: Old\n{{char}}: Answer";
    const current = structuredClone(snapshot);
    current.data.alternate_greetings[0] = "New greeting";
    current.data.mes_example = "<START>\n{{user}}: New\n{{char}}: Answer";
    const diffs = diffCards(current, snapshot);
    expect(diffs.map(value => value.path)).toContain("/data/alternate_greetings/0");
    expect(diffs.map(value => value.path)).toContain("/dialogue/0");
    const restored = restoreCardParts(current, snapshot, ["/dialogue/0"]);
    expect(restored.data.mes_example).toContain("{{user}}: Old");
    expect(restored.data.alternate_greetings[0]).toBe("New greeting");
  });

  it("keeps a bounded undo and redo history", () => {
    const history = new UndoHistory(2);
    const first = { card: emptyCard(), image: null, label: "first" };
    const second = structuredClone(first); second.label = "second";
    history.push(first); history.push(second);
    expect(history.undo({ ...second, label: "current" })?.label).toBe("second");
    expect(history.redo(first)?.label).toBe("current");
  });
});
