type Task = () => Promise<void>;

/**
 * Runs at most `slots` tasks at once. Waiting tasks are taken from each owner
 * in turn, so an agent that queues ten exports does not hold up another
 * agent's one.
 */
export class FairQueue {
  private readonly waiting = new Map<string, Task[]>();
  private running = 0;

  constructor(readonly slots: number) {}

  /** Tasks running or waiting. */
  get size(): number {
    let waiting = 0;
    for (const tasks of this.waiting.values()) waiting += tasks.length;
    return this.running + waiting;
  }

  run<T>(owner: string, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tasks = this.waiting.get(owner) ?? [];
      tasks.push(() => work().then(resolve, reject));
      this.waiting.set(owner, tasks);
      this.pump();
    });
  }

  private pump(): void {
    while (this.running < this.slots) {
      const task = this.next();
      if (!task) return;
      this.running += 1;
      void task().finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  /** Map order is insertion order, so moving an owner to the end rotates it. */
  private next(): Task | undefined {
    for (const [owner, tasks] of this.waiting) {
      const task = tasks.shift();
      this.waiting.delete(owner);
      if (tasks.length > 0) this.waiting.set(owner, tasks);
      if (task) return task;
    }
    return undefined;
  }
}
