import { useEffect, useState } from "react";
import { useGetPortfolioSummary, useListAlerts, getGetPortfolioSummaryQueryKey, getListAlertsQueryKey } from "@workspace/api-client-react";
import { useControlRoom } from "@/context/ControlRoomContext";
import { computeHealthScore, healthScoreColor } from "@/lib/plantHierarchy";
import { GenerationRing } from "@/components/ui/scada";
import { X, Zap, Activity, Radio, Monitor } from "lucide-react";

const CYCLE_INTERVAL_MS = 30_000;

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

export function ControlRoomOverlay() {
  const { isActive, toggle, activePlantIdx, setActivePlantIdx } = useControlRoom();
  const clock = useClock();

  const { data: summary } = useGetPortfolioSummary({
    query: { refetchInterval: 10000, queryKey: getGetPortfolioSummaryQueryKey(), enabled: isActive },
  });
  const { data: alerts = [] } = useListAlerts(
    { status: "open" },
    { query: { refetchInterval: 15000, queryKey: getListAlertsQueryKey({ status: "open" }), enabled: isActive } },
  );

  const plants = summary?.plants ?? [];

  // Auto-cycle through plants every 30 s
  useEffect(() => {
    if (!isActive || plants.length === 0) return;
    const timer = setInterval(() => {
      setActivePlantIdx((activePlantIdx + 1) % plants.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, plants.length, activePlantIdx, setActivePlantIdx]);

  if (!isActive) return null;

  const tickerText = alerts.length === 0
    ? "● ALL SYSTEMS NOMINAL // NO OPEN ALERTS"
    : alerts.map((a) => `● ${a.plantName}: ${a.title}`).join("          ");

  const clockStr = clock.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-brand/50 bg-black flex-shrink-0 relative">
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-brand shadow-[0_0_15px_rgba(0,255,170,0.8)]" />
        <div className="flex items-center gap-4">
          <Monitor className="h-5 w-5 text-brand" />
          <span className="font-mono text-sm font-bold uppercase tracking-widest text-brand">CONTROL ROOM TERMINAL</span>
        </div>
        <div className="flex items-center gap-8">
          {/* Live indicator */}
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-status-normal font-bold">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            LIVE TELEMETRY
          </div>
          <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground bg-white/5 border border-border/50 px-3 py-1">
            {clockStr}
          </span>
          <button
            onClick={toggle}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest font-bold border border-status-fault/50 text-status-fault hover:bg-status-fault/10 px-3 py-1.5 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> CLOSE TERMINAL
          </button>
        </div>
      </div>

      {/* Main plant grid */}
      <div className="flex-1 p-6 grid grid-cols-2 gap-6 min-h-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,170,0.05)_0%,transparent_100%)]">
        {plants.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-border/50 bg-black/40 animate-pulse relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-border/50" />
              </div>
            ))
          : plants.map((plant, i) => {
              const isHighlighted = i === activePlantIdx;
              const utilPct = plant.capacityKw > 0 ? (plant.currentPowerKw / plant.capacityKw) * 100 : 0;
              const score = computeHealthScore(plant.pr, plant.availabilityPct, plant.alertCounts);
              const ringColor = healthScoreColor(score);
              const isFault = plant.healthStatus === "fault";
              const isWarn = plant.healthStatus === "warning";

              return (
                <button
                  key={plant.id}
                  onClick={() => setActivePlantIdx(i)}
                  className={`relative border p-6 flex flex-col gap-6 transition-all text-left cursor-pointer bg-black/60 overflow-hidden
                    ${isHighlighted
                      ? "border-brand shadow-[0_0_30px_rgba(0,255,170,0.15)]"
                      : isFault
                        ? "border-status-fault/50 bg-status-fault/5"
                        : "border-border/50 hover:border-brand/50"
                    }`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full ${
                    isHighlighted ? "bg-brand" : isFault ? "bg-status-fault" : isWarn ? "bg-status-warning" : "bg-status-normal"
                  }`} />

                  {/* Plant name + health */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">{plant.name}</div>
                      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1 bg-white/5 border border-border/50 inline-block px-2 py-0.5">{plant.region}</div>
                    </div>
                    <div className={`font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1 border ${
                      isFault ? "bg-status-fault/10 text-status-fault border-status-fault"
                        : isWarn ? "bg-status-warning/10 text-status-warning border-status-warning"
                          : "bg-status-normal/10 text-status-normal border-status-normal"
                    }`}>
                      {plant.healthStatus}
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="flex items-center gap-8">
                    <div className={isHighlighted ? "drop-shadow-[0_0_15px_rgba(0,255,170,0.4)]" : ""}>
                      <GenerationRing
                        pct={utilPct}
                        label={`${score}`}
                        sublabel="SCORE"
                        size={90}
                        strokeWidth={4}
                        color={ringColor}
                        trackColor="rgba(255,255,255,0.05)"
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-4">
                      <div>
                        <div className="font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">LIVE POWER VECTOR</div>
                        <div className="font-mono text-2xl font-bold text-foreground">
                          {plant.currentPowerKw >= 1000
                            ? `${(plant.currentPowerKw / 1000).toFixed(1)} MW`
                            : `${plant.currentPowerKw.toFixed(0)} KW`}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">CAPACITY INDEX</div>
                        <div className="font-mono text-xl font-bold text-muted-foreground">
                          {(plant.capacityKw / 1000).toFixed(0)} MWP
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">PERF RATIO</div>
                        <div className="font-mono text-lg font-bold text-foreground">{plant.pr.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">UPTIME</div>
                        <div className="font-mono text-lg font-bold text-foreground">{plant.availabilityPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Alert chips */}
                  {(plant.alertCounts.critical > 0 || plant.alertCounts.major > 0) && (
                    <div className="flex items-center gap-2 mt-auto">
                      {plant.alertCounts.critical > 0 && (
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1 border border-status-fault text-status-fault bg-status-fault/10 shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse">
                          {plant.alertCounts.critical} CRITICAL
                        </span>
                      )}
                      {plant.alertCounts.major > 0 && (
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold px-2 py-1 border border-[#e67e22] text-[#e67e22] bg-[#e67e22]/10">
                          {plant.alertCounts.major} MAJOR
                        </span>
                      )}
                    </div>
                  )}

                  {/* Cycle progress bar for highlighted plant */}
                  {isHighlighted && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black">
                      <div
                        className="h-full bg-brand shadow-[0_0_10px_rgba(0,255,170,0.8)]"
                        style={{ animation: `cr-progress ${CYCLE_INTERVAL_MS}ms linear forwards` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
      </div>

      {/* Fleet summary bar */}
      <div className="flex items-center gap-10 px-6 py-4 border-t border-brand/50 bg-black flex-shrink-0">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest">
          <Zap className="h-4 w-4 text-brand" />
          <span className="text-muted-foreground font-bold">GLOBAL FLEET OUTPUT:</span>
          <span className="text-foreground font-bold">
            {summary ? `${summary.totalCurrentPowerMw.toFixed(1)} / ${summary.totalCapacityMw.toFixed(0)} MW` : "..."}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest">
          <Activity className="h-4 w-4 text-status-normal" />
          <span className="text-muted-foreground font-bold">AVG PERF RATIO:</span>
          <span className="text-foreground font-bold">{summary?.avgPr.toFixed(1) ?? "..."}%</span>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-widest font-bold text-muted-foreground ml-auto bg-white/5 border border-border/50 px-3 py-1.5">
          {plants.length} ZONES // AUTO-CYCLE {CYCLE_INTERVAL_MS/1000}S // ESC TO ABORT
        </div>
      </div>

      {/* Alert ticker */}
      <div className={`flex-shrink-0 py-2.5 px-0 border-t ${alerts.some(a => a.severity === "critical") ? "border-status-fault bg-status-fault/10 shadow-[inset_0_0_15px_rgba(239,68,68,0.2)]" : "border-border/50 bg-black/40"} overflow-hidden`}>
        <div
          className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest font-bold"
          style={{ animation: `cr-ticker ${Math.max(20, alerts.length * 6)}s linear infinite` }}
        >
          <span className={alerts.some(a => a.severity === "critical") ? "text-status-fault" : "text-brand"}>
            {tickerText}
            {"          "}
            {tickerText}
          </span>
        </div>
      </div>

      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes cr-ticker {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        @keyframes cr-progress {
          0%   { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
