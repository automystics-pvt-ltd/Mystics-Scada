/**
 * TelemetryStreamContext
 *
 * Starts the SSE connection once for the whole app and makes live sync
 * metadata (connected, lastSync, tickCount) available to any component.
 */

import { createContext, useContext } from "react";
import { useTelemetryStream, type TelemetryState } from "@/hooks/useTelemetryStream";

const TelemetryStreamContext = createContext<TelemetryState>({
  connected: false,
  lastSync:  null,
  tickCount: 0,
});

export function TelemetryStreamProvider({ children }: { children: React.ReactNode }) {
  const state = useTelemetryStream();
  return (
    <TelemetryStreamContext.Provider value={state}>
      {children}
    </TelemetryStreamContext.Provider>
  );
}

export function useTelemetry(): TelemetryState {
  return useContext(TelemetryStreamContext);
}
