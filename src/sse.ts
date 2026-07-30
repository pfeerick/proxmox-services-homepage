import type { Container } from "./types.ts";
import { computeServices } from "./utils.ts";

type SSEController = ReadableStreamDefaultController<Uint8Array>;

const subscribers = new Set<SSEController>();
const encoder = new TextEncoder();

/**
 * Serialise a container snapshot as the `containers` + `services` SSE event pair.
 *
 * Used both for the initial payload a new subscriber receives and for the push on
 * each cache refresh, so the two can't drift apart.
 */
export function serializeSnapshot(containers: Container[], lastUpdated: string): string {
  const services = computeServices(containers);
  const containersEvent = JSON.stringify({
    containers,
    last_updated: lastUpdated,
    total: containers.length,
  });
  const servicesEvent = JSON.stringify({
    services,
    last_updated: lastUpdated,
    total: services.length,
  });
  return `event: containers\ndata: ${containersEvent}\n\nevent: services\ndata: ${servicesEvent}\n\n`;
}

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

// Keep-alive: some proxies close idle SSE connections after ~30 s.
// unref'd so it never holds the process open on its own — Bun.serve does that —
// which also keeps this module importable from tests without hanging them.
setInterval(() => {
  const heartbeat = encoder.encode(": heartbeat\n\n");
  for (const ctrl of [...subscribers]) {
    try {
      ctrl.enqueue(heartbeat);
    } catch {
      subscribers.delete(ctrl);
    }
  }
}, 25_000).unref();
