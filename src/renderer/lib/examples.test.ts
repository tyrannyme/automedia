import { describe, expect, it } from "vitest";
import { exampleIds, listExamples } from "../../engine/examples/index.ts";
import { exampleGroups, exampleTemplates, matchesTemplate } from "./examples.ts";

describe("New sheet templates", () => {
  it("lists every engine example once, with the engine's own name and description", () => {
    const engine = listExamples();
    expect(exampleTemplates.map((item) => item.id)).toEqual([...exampleIds]);
    for (const item of exampleTemplates) {
      const match = engine.find((entry) => entry.id === item.id);
      expect({ name: item.name, description: item.description }).toEqual({
        name: match?.name,
        description: match?.description,
      });
    }
  });

  it("puts every example in exactly one group", () => {
    const grouped = exampleGroups.flatMap((group) => group.ids);
    expect(grouped.toSorted()).toEqual(exampleIds.toSorted());
  });

  it("searches names and descriptions", () => {
    const css = exampleTemplates[0]!;
    expect(matchesTemplate(css, "")).toBe(true);
    expect(matchesTemplate(css, "seek")).toBe(true);
    expect(matchesTemplate(css, "shader")).toBe(false);
  });
});
