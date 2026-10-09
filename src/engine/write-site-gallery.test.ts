import { describe, expect, it } from "vitest";
import { writeSiteGallery } from "./write-site-gallery.ts";

describe.skipIf(!process.env.SITE_GALLERY)("site gallery", () => {
  it("exports site/public/gallery through the studio export queue", async () => {
    const entries = await writeSiteGallery();
    expect(entries.length).toBeGreaterThan(0);
  }, 1_800_000);
});
