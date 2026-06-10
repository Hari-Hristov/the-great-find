import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "./queries";

export type EventName =
  | "alert.fired"
  | "listing.new"
  | "listing.updated"
  | "scheduler.tick"
  | string;

export interface BusEvent {
  name: EventName;
  data: unknown;
  receivedAt: number;
}

interface UseEventStreamOpts {
  invalidate?: Partial<Record<EventName, ReadonlyArray<readonly unknown[]>>>;
  enabled?: boolean;
}

export function useEventStream(opts: UseEventStreamOpts = {}) {
  const { enabled = true } = opts;
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<BusEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/events");
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handler = (name: EventName) => (ev: MessageEvent) => {
      let parsed: unknown = ev.data;
      try {
        parsed = JSON.parse(ev.data);
      } catch {}
      const evt: BusEvent = { name, data: parsed, receivedAt: Date.now() };
      setLast(evt);

      if (name === "alert.fired") {
        qc.invalidateQueries({ queryKey: qk.alerts(100) });
      }
      if (name.startsWith("listing.")) {
        qc.invalidateQueries({ queryKey: ["listings"] });
      }

      const extra = opts.invalidate?.[name];
      if (extra) {
        for (const key of extra) {
          qc.invalidateQueries({ queryKey: key as readonly unknown[] });
        }
      }
    };

    const names: EventName[] = [
      "alert.fired",
      "listing.new",
      "listing.updated",
      "scheduler.tick",
    ];
    for (const n of names) es.addEventListener(n, handler(n));

    return () => {
      es.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [enabled, qc, opts.invalidate]);

  return { connected, last };
}
