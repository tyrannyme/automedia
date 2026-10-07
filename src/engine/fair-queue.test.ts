import { describe, expect, it } from "vitest";
import { FairQueue } from "./fair-queue.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("FairQueue", () => {
  it("never runs more than its slots at once", async () => {
    const queue = new FairQueue(2);
    let running = 0;
    let peak = 0;
    const work = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 6 }, (_, index) => queue.run(`owner${index}`, work)));

    expect(peak).toBe(2);
    expect(queue.size).toBe(0);
  });

  it("takes waiting work from each owner in turn", async () => {
    const queue = new FairQueue(1);
    const gate = deferred();
    const order: string[] = [];
    const blocker = queue.run("busy", () => gate.promise);
    const runs = [
      ...["a1", "a2", "a3"].map((name) => queue.run("a", async () => void order.push(name))),
      ...["b1", "b2"].map((name) => queue.run("b", async () => void order.push(name))),
    ];

    gate.resolve();
    await Promise.all([blocker, ...runs]);

    expect(order).toEqual(["a1", "b1", "a2", "b2", "a3"]);
  });

  it("passes results and failures back to the caller", async () => {
    const queue = new FairQueue(1);

    await expect(queue.run("a", async () => 42)).resolves.toBe(42);
    await expect(
      queue.run("a", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(queue.run("a", async () => "still running")).resolves.toBe("still running");
  });
});
