// In-process pub/sub so every connected client sees engine decisions live.
// Each SSE connection registers a subscriber; mutations broadcast a version bump.
type Subscriber = (version: number) => void;

const g = globalThis as unknown as {
  __whBus?: { subs: Set<Subscriber>; version: number };
};

function bus() {
  if (!g.__whBus) g.__whBus = { subs: new Set(), version: 0 };
  return g.__whBus;
}

export function subscribe(fn: Subscriber): () => void {
  const b = bus();
  b.subs.add(fn);
  return () => b.subs.delete(fn);
}

export function currentVersion(): number {
  return bus().version;
}

export function broadcast(): number {
  const b = bus();
  b.version += 1;
  for (const fn of b.subs) {
    try {
      fn(b.version);
    } catch {
      // a dead connection must never break the mutation that triggered it
    }
  }
  return b.version;
}
