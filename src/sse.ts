type SSEController = ReadableStreamDefaultController<Uint8Array>;

const subscribers = new Set<SSEController>();
const encoder = new TextEncoder();

export function createSSEStream(initialPayload: () => string): ReadableStream<Uint8Array> {
  let controller: SSEController;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      subscribers.add(c);
      c.enqueue(encoder.encode(initialPayload()));
    },
    cancel() {
      subscribers.delete(controller);
    },
  });

  return stream;
}

export function pushToSubscribers(payload: string): void {
  const encoded = encoder.encode(payload);
  const dead = new Set<SSEController>();

  for (const ctrl of subscribers) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      dead.add(ctrl);
    }
  }

  for (const ctrl of dead) subscribers.delete(ctrl);
}

// Keep-alive: some proxies close idle SSE connections after ~30 s
setInterval(() => {
  const heartbeat = encoder.encode(": heartbeat\n\n");
  for (const ctrl of [...subscribers]) {
    try {
      ctrl.enqueue(heartbeat);
    } catch {
      subscribers.delete(ctrl);
    }
  }
}, 25_000);
