import { describe, expect, it } from "vitest";
import { emptyDialogueExample, joinDialogueExamples, splitDialogueExamples } from "./dialogue-examples";

describe("dialogue example blocks", () => {
  it("splits and joins separate START blocks without combining their scenes", () => {
    const source = "<START>\n{{user}}: Hello\n{{char}}: Welcome\n\n<START>\n{{user}}: Bye\n{{char}}: Take care";
    const examples = splitDialogueExamples(source);

    expect(examples).toEqual([
      "<START>\n{{user}}: Hello\n{{char}}: Welcome",
      "<START>\n{{user}}: Bye\n{{char}}: Take care"
    ]);
    expect(joinDialogueExamples(examples)).toBe(source);
  });

  it("preserves legacy content without a START marker as one editable example", () => {
    expect(splitDialogueExamples("{{user}}: Hello\n{{char}}: Hi")).toEqual(["{{user}}: Hello\n{{char}}: Hi"]);
  });

  it("creates a valid blank SillyTavern dialogue template", () => {
    expect(emptyDialogueExample()).toContain("<START>");
    expect(emptyDialogueExample()).toContain("{{user}}:");
    expect(emptyDialogueExample()).toContain("{{char}}:");
  });
});
