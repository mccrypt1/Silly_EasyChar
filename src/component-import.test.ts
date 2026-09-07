import { describe, expect, it } from "vitest";
import { emptyCard, normalizeLoreEntry } from "./card";
import { importCardParts } from "./component-import";

describe("selective card component import", () => {
  it("replaces selected text fields but leaves unselected fields unchanged", () => {
    const target = emptyCard();
    target.data.description = "Keep";
    target.data.personality = "Old";
    const source = emptyCard();
    source.data.description = "Ignored";
    source.data.personality = "Imported";
    const result = importCardParts(target, source, ["personality"]);
    expect(result.data.description).toBe("Keep");
    expect(result.data.personality).toBe("Imported");
  });

  it("appends greetings, merges tags, and reindexes appended lore", () => {
    const target = emptyCard();
    target.data.alternate_greetings = ["Existing"];
    target.data.tags = ["one"];
    target.data.character_book = { entries: [normalizeLoreEntry({ content: "Existing lore" }, 0)] };
    const source = emptyCard();
    source.data.alternate_greetings = ["Imported"];
    source.data.tags = ["one", "two"];
    source.data.character_book = { name: "Source", entries: [normalizeLoreEntry({ content: "Imported lore" }, 8)] };
    const result = importCardParts(target, source, ["alternate_greetings", "tags", "character_book"]);
    expect(result.data.alternate_greetings).toEqual(["Existing", "Imported"]);
    expect(result.data.tags).toEqual(["one", "two"]);
    expect(result.data.character_book?.entries.map(entry => [entry.uid, entry.content]))
      .toEqual([[0, "Existing lore"], [1, "Imported lore"]]);
  });
});
