import { describe, expect, it } from "vitest";
import { formatElapsed, hallucinationDelay, LOADING_HALLUCINATIONS } from "./loading";

describe("Ollama loading indicator", () => {
  it("switches to minutes after 180 seconds", () => {
    expect(formatElapsed(179)).toBe("179 s");
    expect(formatElapsed(180)).toBe("3 min 00 s");
    expect(formatElapsed(1400)).toBe("23 min 20 s");
  });

  it("uses all twenty messages and a 20–35 second delay", () => {
    expect(LOADING_HALLUCINATIONS).toHaveLength(20);
    expect(hallucinationDelay(() => 0)).toBe(20_000);
    expect(hallucinationDelay(() => 1)).toBe(35_000);
  });
});
