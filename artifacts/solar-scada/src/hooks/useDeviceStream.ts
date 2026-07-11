/**
 * useDeviceStream
 *
 * Opens an SSE connection to /api/stream/devices/:deviceId and exposes the
 * latest live reading for that device, updating in real time as the driver
 * (or, once connected, a replayed last-known reading) pushes new data —
 * no manual refresh or polling interval required.
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface DeviceReadingEvent {
  deviceId: string;
  ts: string;
  params: Record<string, number | string | boolean | null>;
  replay?: boolean;
}

export interface DeviceStreamState {
  connected:     boolean;
  latest:        { ts: string; params: Record<string, number | string | boolean | null> } | null;
  lastEventAt:   Date | null;
}

const RECONNECT_DELAY_MS = 3_000;

export function useDeviceStream(deviceId: string | null): DeviceStreamState {
  const esRef    = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<DeviceStreamState>({
    connected:   false,
    latest:      null,
    lastEventAt: null,
  });

  const connect = useCallback(() => {
    if (!deviceId) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const base = import.meta.env.BASE_URL;
    const es = new EventSource(`${base}api/stream/devices/${deviceId}`);
    esRef.current = es;

    es.addEventListener("device_reading", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data) as DeviceReadingEvent;
        if (data.deviceId !== deviceId) return;
        setState({
          connected:   true,
          latest:      { ts: data.ts, params: data.params },
          lastEventAt: new Date(),
        });
      } catch (err) {
        console.warn("[device-stream] parse error", err);
      }
    });

    es.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setState((prev) => ({ ...prev, connected: false }));
      retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [deviceId]);

  useEffect(() => {
    // Reset immediately on device change (or disable) so a reading from a
    // previously viewed device never briefly shows up under a new one.
    setState({ connected: false, latest: null, lastEventAt: null });

    if (!deviceId) return;
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [deviceId, connect]);

  return state;
}
