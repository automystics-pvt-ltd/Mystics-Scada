/**
 * useTelemetryStream
 *
 * Opens an SSE connection to /api/stream/telemetry and writes each received
 * frame directly into the React Query cache so every component that subscribes
 * to portfolio / plant queries refreshes without a separate HTTP poll.
 *
 * Also maintains a per-plant power history ring buffer (last 40 points ≈ 2 min
 * at 3 s intervals) that the portfolio page can use for real sparklines instead
 * of synthetic ones.
 *
 * Returns { connected, lastSync, tickCount, plantHistory } for UI indicators.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPortfolioSummaryQueryKey,
  getGetPlantQueryKey,
  getListInvertersQueryKey,
} from "@workspace/api-client-react";

/** Minimal shape of a notification pushed over SSE. */
interface SseNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PlantPowerPoint {
  ts: string;
  powerKw: number;
}

export interface TelemetryState {
  connected:    boolean;
  lastSync:     Date | null;
  tickCount:    number;
  /** Per-plant live power history (ring buffer of last 40 SSE frames). */
  plantHistory: Record<string, PlantPowerPoint[]>;
}

const SSE_URL = `${import.meta.env.BASE_URL}api/stream/telemetry`;
const RECONNECT_DELAY_MS = 3_000;
const HISTORY_SIZE = 40; // ~2 min at 3s intervals

export function useTelemetryStream(): TelemetryState {
  const queryClient = useQueryClient();
  const esRef       = useRef<EventSource | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<TelemetryState>({
    connected:    false,
    lastSync:     null,
    tickCount:    0,
    plantHistory: {},
  });

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(SSE_URL);
    esRef.current = es;

    // ── Real-time notification push ─────────────────────────────────────
    es.addEventListener("notification", (evt: MessageEvent) => {
      try {
        const notif = JSON.parse(evt.data) as SseNotification;
        // Prepend to the cached list so the panel shows it immediately
        queryClient.setQueryData(["notifications", "list"], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            data: [notif, ...(old.data ?? [])].slice(0, 50),
          };
        });
        // Bump unread count
        queryClient.setQueryData(["notifications", "unread-count"], (old: any) => ({
          count: ((old?.count as number) ?? 0) + 1,
        }));
      } catch (err) {
        console.warn("[telemetry-stream] malformed notification event", err);
      }
    });

    es.addEventListener("telemetry", (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data) as {
          timestamp: string;
          fleet: {
            totalPowerMw:    number;
            totalEnergyMwh:  number;
            avgPr:           number;
            totalCapacityMw: number;
          };
          plants: Array<{
            id:               string;
            powerKw:          number;
            energyKwh:        number;
            pr:               number;
            availabilityPct:  number;
            health:           string;
            irradianceWm2:    number;
            offlineInverters: number;
          }>;
        };

        const ts = new Date(payload.timestamp);

        // ── Update portfolio summary cache ──────────────────────────────
        queryClient.setQueriesData(
          { queryKey: getGetPortfolioSummaryQueryKey() },
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              totalCurrentPowerMw:     payload.fleet.totalPowerMw,
              totalGenerationTodayMwh: payload.fleet.totalEnergyMwh,
              avgPr:                   payload.fleet.avgPr,
              plants: (old.plants ?? []).map((p: any) => {
                const live = payload.plants.find((lp) => lp.id === p.id);
                if (!live) return p;
                return {
                  ...p,
                  currentPowerKw:  live.powerKw,
                  todayEnergyKwh:  live.energyKwh,
                  pr:              live.pr,
                  availabilityPct: live.availabilityPct,
                  healthStatus:    live.health,
                };
              }),
            };
          },
        );

        // ── Update each plant's detail cache (if it's in cache) ────────
        for (const live of payload.plants) {
          queryClient.setQueriesData(
            { queryKey: getGetPlantQueryKey(live.id) },
            (old: any) => {
              if (!old) return old;
              return {
                ...old,
                currentPowerKw:      live.powerKw,
                todayEnergyKwh:      live.energyKwh,
                pr:                  live.pr,
                availabilityPct:     live.availabilityPct,
                healthStatus:        live.health,
                irradiancePoaWm2:    live.irradianceWm2,
                irradianceGhiWm2:    Math.round(live.irradianceWm2 * 0.95),
                offlineInverterCount: live.offlineInverters,
                lastUpdated:         ts,
              };
            },
          );
        }

        // ── Append to per-plant power history ring buffer ───────────────
        setState(prev => {
          const nextHistory = { ...prev.plantHistory };
          for (const live of payload.plants) {
            const existing = nextHistory[live.id] ?? [];
            const point: PlantPowerPoint = { ts: payload.timestamp, powerKw: live.powerKw };
            // Avoid duplicate timestamps
            if (existing.length > 0 && existing[existing.length - 1]!.ts === payload.timestamp) {
              nextHistory[live.id] = existing;
              continue;
            }
            const next = [...existing, point];
            nextHistory[live.id] = next.length > HISTORY_SIZE ? next.slice(next.length - HISTORY_SIZE) : next;
          }
          return {
            connected:    true,
            lastSync:     ts,
            tickCount:    prev.tickCount + 1,
            plantHistory: nextHistory,
          };
        });
      } catch (err) {
        console.warn("[telemetry-stream] parse error", err);
      }
    });

    es.onopen = () => {
      setState(prev => ({ ...prev, connected: true }));
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setState(prev => ({ ...prev, connected: false }));
      // Reconnect after a delay
      retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [queryClient]);

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
