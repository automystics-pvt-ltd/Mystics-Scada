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
    ? "● All systems nominal — no open alerts"
    : alerts.map((a) => `● ${a.plantName}: ${a.title}`).join("          ");

  const clockStr = clock.toUTCString().replace("GMT", "UTC").slice(0, 25);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#05080a] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/40 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Monitor className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold tracking-[0.15em] uppercase text-primary">Solar SCADA</span>
          <span className="text-xs text-white/40 tracking-widest uppercase">Control Room</span>
        </div>
        <div className="flex items-center gap-6">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Radio className="h-3 w-3 animate-pulse" />
            <span className="font-mono">Live</span>
          </div>
          <span className="font-mono text-xs text-white/60">{clockStr}</span>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/20 text-xs text-white/70 hover:text-white hover:border-white/50 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Exit
          </button>
        </div>
      </div>

      {/* Main plant grid */}
      <div className="flex-1 p-6 grid grid-cols-2 gap-4 min-h-0">
        {plants.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white/5 rounded-xl border border-white/10 animate-pulse" />
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
                  className={`relative rounded-xl border-2 p-5 flex flex-col gap-4 transition-all text-left cursor-pointer
                    ${isHighlighted
                      ? "border-primary bg-primary/10 shadow-[0_0_40px_rgba(34,197,94,0.15)]"
                      : isFault
                        ? "border-red-500/50 bg-red-950/30"
                        : "border-white/10 bg-white/5 hover:border-white/25"
                    }`}
                >
                  {/* Plant name + health */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-base text-white/90">{plant.name}</div>
                      <div className="text-xs text-white/40 mt-0.5">{plant.region}</div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isFault ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : isWarn ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-green-500/20 text-green-400 border border-green-500/30"
                    }`}>
                      {plant.healthStatus.toUpperCase()}
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="flex items-center gap-6">
                    <GenerationRing
                      pct={utilPct}
                      label={`${score}`}
                      sublabel="score"
                      size={80}
                      strokeWidth={7}
                      color={ringColor}
                      trackColor="rgba(255,255,255,0.08)"
                    />
                    <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2">
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">Live Power</div>
                        <div className="text-2xl font-bold font-mono text-white/90">
                          {plant.currentPowerKw >= 1000
                            ? `${(plant.currentPowerKw / 1000).toFixed(1)} MW`
                            : `${plant.currentPowerKw.toFixed(0)} kW`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">Capacity</div>
                        <div className="text-xl font-bold font-mono text-white/70">
                          {(plant.capacityKw / 1000).toFixed(0)} MWp
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">PR</div>
                        <div className="text-lg font-mono font-semibold text-white/80">{plant.pr.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">Availability</div>
                        <div className="text-lg font-mono font-semibold text-white/80">{plant.availabilityPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Alert chips */}
                  {(plant.alertCounts.critical > 0 || plant.alertCounts.major > 0) && (
                    <div className="flex items-center gap-2">
                      {plant.alertCounts.critical > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                          {plant.alertCounts.critical} Critical
                        </span>
                      )}
                      {plant.alertCounts.major > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {plant.alertCounts.major} Major
                        </span>
                      )}
                    </div>
                  )}

                  {/* Cycle progress bar for highlighted plant */}
                  {isHighlighted && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-b-xl overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ animation: `cr-progress ${CYCLE_INTERVAL_MS}ms linear forwards` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
      </div>

      {/* Fleet summary bar */}
      <div className="flex items-center gap-8 px-6 py-2 border-t border-white/10 bg-black/30 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span>Fleet:</span>
          <span className="font-mono text-white/80 font-medium">
            {summary ? `${summary.totalCurrentPowerMw.toFixed(1)} / ${summary.totalCapacityMw.toFixed(0)} MW` : "--"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Activity className="h-3.5 w-3.5 text-green-400" />
          <span>Avg PR:</span>
          <span className="font-mono text-white/80 font-medium">{summary?.avgPr.toFixed(1) ?? "--"}%</span>
        </div>
        <div className="text-xs text-white/30">
          {plants.length} plants · Auto-cycle 30s · Press Esc to exit
        </div>
      </div>

      {/* Alert ticker */}
      <div className={`flex-shrink-0 py-2 px-0 border-t overflow-hidden ${alerts.some(a => a.severity === "critical") ? "border-red-500/30 bg-red-950/40" : "border-white/10 bg-black/40"}`}>
        <div
          className="whitespace-nowrap text-xs font-mono"
          style={{ animation: `cr-ticker ${Math.max(20, alerts.length * 6)}s linear infinite` }}
        >
          <span className={alerts.some(a => a.severity === "critical") ? "text-red-400" : "text-white/50"}>
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
