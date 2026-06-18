import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BusEvent, EventName } from "@/api/types";

interface EventStreamState {
  connected: boolean;
  last: BusEvent | null;
}

const EventStreamContext = createContext<EventStreamState>({ connected: false, last: null });

export function useEventStreamContext() {
  return useContext(EventStreamContext);
}

const EVENT_NAMES: EventName[] = ["alert.fired", "listing.new", "listing.updated", "listing.removed", "poll.finished"];

export function EventStreamProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<BusEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/events");
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handler = (name: EventName) => (ev: MessageEvent) => {
      let parsed: unknown = ev.data;
      try { parsed = JSON.parse(ev.data); } catch { /* non-JSON payload — use raw string */ }
      setLast({ name, data: parsed, receivedAt: Date.now() });

      if (name === "alert.fired") qc.invalidateQueries({ queryKey: ["alerts"] });
      if (name.startsWith("listing.")) qc.invalidateQueries({ queryKey: ["listings"] });
      if (name === "poll.finished") qc.invalidateQueries({ queryKey: ["searches"] });
    };

    for (const n of EVENT_NAMES) es.addEventListener(n, handler(n));

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [qc]);

  return (
    <EventStreamContext.Provider value={{ connected, last }}>
      {children}
    </EventStreamContext.Provider>
  );
}
