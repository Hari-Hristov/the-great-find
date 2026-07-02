import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BusEvent, EventName } from "@/api/types";
import { getBackendOrigin } from "@/api/client";

interface EventStreamState {
  connected: boolean;
  last: BusEvent | null;
}

const EventStreamContext = createContext<EventStreamState>({ connected: false, last: null });

export function useEventStreamContext() {
  return useContext(EventStreamContext);
}

const EVENT_NAMES: EventName[] = ["alert.fired", "listing.new", "listing.updated", "listing.removed", "poll.finished"];
const MAX_BACKOFF_MS = 30_000;

export function EventStreamProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<BusEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    connectRef.current = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      const es = new EventSource(`${getBackendOrigin()}/events`);
      sourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        attemptRef.current = 0;
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        sourceRef.current = null;

        const delay = Math.min(1_000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        retryRef.current = setTimeout(() => connectRef.current(), delay);
      };

      const handler = (name: EventName) => (ev: MessageEvent) => {
        let parsed: unknown = ev.data;
        try { parsed = JSON.parse(ev.data); } catch { /* non-JSON payload — use raw string */ }
        setLast({ name, data: parsed, receivedAt: Date.now() });

        if (name === "alert.fired") qc.invalidateQueries({ queryKey: ["alerts"] });
        if (name.startsWith("listing.")) {
          qc.invalidateQueries({ queryKey: ["listings"] });
          qc.invalidateQueries({ queryKey: ["alerts"] });
        }
        if (name === "poll.finished") qc.invalidateQueries({ queryKey: ["searches"] });
      };

      for (const n of EVENT_NAMES) es.addEventListener(n, handler(n));
    };

    connectRef.current();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [qc]);

  return (
    <EventStreamContext.Provider value={{ connected, last }}>
      {children}
    </EventStreamContext.Provider>
  );
}
