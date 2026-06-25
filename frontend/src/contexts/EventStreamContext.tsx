import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { BusEvent, EventName } from "@/api/types";

interface EventStreamState {
  connected: boolean;
  last: BusEvent | null;
  /** Timestamp (ms) of the operator's most recent visit to /dashboard/alerts. */
  lastAlertsVisit: number;
}

const EventStreamContext = createContext<EventStreamState>({
  connected: false,
  last: null,
  lastAlertsVisit: 0,
});

export function useEventStreamContext() {
  return useContext(EventStreamContext);
}

const EVENT_NAMES: EventName[] = ["alert.fired", "listing.new", "listing.updated", "listing.removed", "poll.finished"];
const MAX_BACKOFF_MS = 30_000;
const ALERTS_VISIT_KEY = "tgf-alerts-last-visit";
const ALERTS_VISIT_EVENT = "tgf:alerts-visit";

function readLastVisit(): number {
  if (typeof window === "undefined") return 0;
  const stored = window.localStorage.getItem(ALERTS_VISIT_KEY);
  return stored ? Number(stored) || 0 : 0;
}

/**
 * Subscribe to the persisted "last alerts visit" timestamp via
 * useSyncExternalStore. We dispatch a custom event whenever we write the
 * value, which lets React subscribers re-derive without a setState-in-effect.
 */
function useLastAlertsVisit(): number {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener(ALERTS_VISIT_EVENT, callback);
      window.addEventListener("storage", callback);
      return () => {
        window.removeEventListener(ALERTS_VISIT_EVENT, callback);
        window.removeEventListener("storage", callback);
      };
    },
    readLastVisit,
    () => 0,
  );
}

function bumpLastAlertsVisit() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERTS_VISIT_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent(ALERTS_VISIT_EVENT));
}

export function EventStreamProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const pathname = useLocation({ select: (s) => s.pathname });
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<BusEvent | null>(null);
  const lastAlertsVisit = useLastAlertsVisit();
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});

  // External-system sync: bump the persisted "last visited alerts" timestamp
  // whenever the operator's path is on /dashboard/alerts*. The write goes to
  // localStorage and dispatches a custom event; useSyncExternalStore subscribers
  // pick up the new value without us calling setState here.
  useEffect(() => {
    if (pathname.startsWith("/dashboard/alerts")) {
      bumpLastAlertsVisit();
    }
  }, [pathname]);

  useEffect(() => {
    connectRef.current = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      const es = new EventSource("/events");
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
    <EventStreamContext.Provider value={{ connected, last, lastAlertsVisit }}>
      {children}
    </EventStreamContext.Provider>
  );
}
