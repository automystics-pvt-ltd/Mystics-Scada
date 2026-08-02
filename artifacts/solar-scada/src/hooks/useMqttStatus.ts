/**
 * useMqttStatus
 *
 * Opens an SSE connection to /api/stream/mqtt-status and returns the current
 * MQTT broker connection state in real time.  The hook reconnects automatically
 * if the SSE connection itself drops (e.g. on a VPS restart).
 *
 * Returned status values:
 *   "disabled"      — MQTT_BROKER_URL not configured on the server
 *   "connecting"    — initial connection attempt in progress
 *   "connected"     — broker reachable and telemetry flowing
 *   "reconnecting"  — connection was lost; exponential backoff retry active
 *   "disconnected"  — subscriber explicitly stopped (rare)
 *
 * The hook also exposes `sseConnected` (the HTTP SSE channel itself) so
 * callers can distinguish "we don't know yet" from "server says connected".
 */

import { useEffect, useRef, useState, useCallback } from "react";

export type MqttStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface MqttStatusState {
  /** Current MQTT broker state as reported by the server */
  status: MqttStatus | null;
  /** Whether the SSE channel to the server is open */
  sseConnected: boolean;
}

const SSE_RECONNECT_MS = 4_000;

export function useMqttStatus(): MqttStatusState {
  const esRef    = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<MqttStatusState>({
    status:       null,
    sseConnected: false,
  });

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const base = import.meta.env.BASE_URL as string;
    const es = new EventSource(`${base}api/stream/mqtt-status`);
    esRef.current = es;

    es.addEventListener("mqtt_status", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data) as { status: MqttStatus };
        setState({ status: data.status, sseConnected: true });
      } catch (err) {
        console.warn("[mqtt-status] parse error", err);
      }
    });

    es.onopen = () => {
      setState((prev) => ({ ...prev, sseConnected: true }));
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setState((prev) => ({ ...prev, sseConnected: false }));
      retryRef.current = setTimeout(connect, SSE_RECONNECT_MS);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return state;
}
