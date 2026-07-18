/**
 * usePlantTelemetryStream
 *
 * Opens a per-plant SSE connection to /api/stream/telemetry/:plantId and
 * delivers inverter-level readings in real time (every 3 s).
 *
 * Also writes plant-level KPIs directly into the React Query cache so the
 * plant dashboard page refreshes without waiting for the next HTTP poll.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetPlantQueryKey } from "@workspace/api-client-react";

export type InverterStatus = "running" | "standby" | "fault" | "comm_lost";

export interface LiveInverter {
  index:         number;
  status:        InverterStatus;
  simulated:     boolean;
  acPowerKw:     number;
  dcPowerKw:     number;
  acVoltageV:    number;
  acCurrentA:    number;
  efficiencyPct: number;
  temperatureC:  number;
}

export interface PlantTelemetryFrame {
  timestamp:    string;
  plantId:      string;
  powerKw:      number;
  energyKwh:    number;
  pr:           number;
  irradianceWm2: number;
  health:       string;
  inverters:    LiveInverter[];
}

export interface PlantTelemetryState {
  connected:  boolean;
  latest:     PlantTelemetryFrame | null;
  lastSync:   Date | null;
  tickCount:  number;
}

const RECONNECT_DELAY_MS = 3_000;

export function usePlantTelemetryStream(plantId: string | null): PlantTelemetryState {
  const queryClient = useQueryClient();
  const esRef       = useRef<EventSource | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<PlantTelemetryState>({
    connected: false,
    latest:    null,
    lastSync:  null,
    tickCount: 0,
  });

  const connect = useCallback(() => {
    if (!plantId) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const base = import.meta.env.BASE_URL as string;
    const es = new EventSource(`${base}api/stream/telemetry/${plantId}`);
    esRef.current = es;

    es.addEventListener("plant_telemetry", (evt: MessageEvent) => {
      try {
        const frame = JSON.parse(evt.data) as PlantTelemetryFrame;
        if (frame.plantId !== plantId) return;

        const ts = new Date(frame.timestamp);

        // Write live KPIs directly into the plant detail cache so the page
        // updates without waiting for the next HTTP refetch cycle.
        queryClient.setQueriesData(
          { queryKey: getGetPlantQueryKey(plantId) },
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              currentPowerKw:      frame.powerKw,
              todayEnergyKwh:      frame.energyKwh,
              pr:                  frame.pr,
              healthStatus:        frame.health,
              irradiancePoaWm2:    frame.irradianceWm2,
              irradianceGhiWm2:    Math.round(frame.irradianceWm2 * 0.95),
              lastUpdated:         ts,
            };
          },
        );

        setState(prev => ({
          connected: true,
          latest:    frame,
          lastSync:  ts,
          tickCount: prev.tickCount + 1,
        }));
      } catch (err) {
        console.warn("[plant-telemetry-stream] parse error", err);
      }
    });

    es.onopen = () => {
      setState(prev => ({ ...prev, connected: true }));
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setState(prev => ({ ...prev, connected: false }));
      retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [plantId, queryClient]);

  useEffect(() => {
    setState({ connected: false, latest: null, lastSync: null, tickCount: 0 });
    if (!plantId) return;
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [plantId, connect]);

  return state;
}
