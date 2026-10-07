import { describe, expect, it } from "vitest";
import { writeReadmeBanner } from "./write-readme-banner.ts";

describe.skipIf(!process.env.README_BANNER)("readme banner", () => {
  it("exports docs/banner.png through the studio export queue", async () => {
    const filePath = await writeReadmeBanner();
    expect(filePath.endsWith("docs/banner.png")).toBe(true);
  }, 120_000);
});
