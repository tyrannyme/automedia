import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import {
  defaultHeavySlots,
  defaultLightSlots,
  RenderPool,
  type PoolBrowser,
} from "./render-pool.ts";

/** Just enough of a Playwright browser to count launches and contexts. */
class FakeBrowser implements PoolBrowser {
  connected = true;
  contexts = 0;
  closed = false;

  isConnected(): boolean {
    return this.connected;
  }

  async newContext() {
    this.contexts += 1;
    return {
      newPage: async () => {
        // SAFETY: the pool only hands the page to the caller's callback.
        return {} as Page;
      },
      close: async () => undefined,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.connected = false;
  }
}

function fakeLauncher() {
  const launched: FakeBrowser[] = [];
  const launch = async () => {
    const browser = new FakeBrowser();
    launched.push(browser);
    return browser;
  };
  return { launched, launch };
}

const viewport = { width: 64, height: 64 };

describe("RenderPool", () => {
  it("shares one browser between pages that open together", async () => {
    const { launched, launch } = fakeLauncher();
    const pool = new RenderPool({ launch });

    await Promise.all(
      Array.from({ length: 5 }, () => pool.withPage(viewport, async () => undefined)),
    );

    expect(launched).toHaveLength(1);
    expect(launched[0]?.contexts).toBe(5);
    await pool.close();
  });

  it("closes the browser once it has been idle", async () => {
    const { launched, launch } = fakeLauncher();
    const pool = new RenderPool({ launch, idleMs: 10 });

    await pool.withPage(viewport, async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(launched[0]?.closed).toBe(true);
    await pool.withPage(viewport, async () => undefined);
    expect(launched).toHaveLength(2);
    await pool.close();
  });

  it("launches a new browser after the old one disconnects", async () => {
    const { launched, launch } = fakeLauncher();
    const pool = new RenderPool({ launch });

    await pool.withPage(viewport, async () => undefined);
    const first = launched[0];
    if (first) first.connected = false;
    await pool.withPage(viewport, async () => undefined);

    expect(launched).toHaveLength(2);
    await pool.close();
  });

  it("reports busy while a page is open", async () => {
    const { launch } = fakeLauncher();
    const pool = new RenderPool({ launch });
    let busyInside = false;

    await pool.withPage(viewport, async () => {
      busyInside = pool.busy;
    });

    expect(busyInside).toBe(true);
    expect(pool.busy).toBe(false);
    await pool.close();
  });

  it("sizes slots from the core count", () => {
    expect(defaultLightSlots(4)).toBe(2);
    expect(defaultLightSlots(24)).toBe(6);
    expect(defaultLightSlots(64)).toBe(6);
    expect(defaultHeavySlots(4)).toBe(1);
    expect(defaultHeavySlots(24)).toBe(4);
  });
});
