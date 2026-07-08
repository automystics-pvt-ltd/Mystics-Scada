import { useGetPlantSld, getGetPlantSldQueryKey, SldNode, SldNodeType, HealthState } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Link, useParams } from "wouter";
import { Network, ArrowLeft, Zap, Box, Server, Factory, Flashlight } from "lucide-react";
import { LiveValue, HealthBadge } from "@/components/ui/scada";

const TYPE_ICONS: Record<SldNodeType, any> = {
  panel_array: Box,
  string: Box,
  combiner: Server,
  inverter: Cpu, // mapped below
  transformer: Factory,
  switchyard: Flashlight,
  grid: Network
};
import { Cpu } from "lucide-react";

function NodeStatusBorder({ status }: { status: HealthState }) {
  switch (status) {
    case "normal": return "border-status-normal shadow-[0_0_8px_rgba(34,197,94,0.3)]";
    case "warning": return "border-status-warning shadow-[0_0_8px_rgba(245,158,11,0.3)]";
    case "fault": return "border-status-fault shadow-[0_0_8px_rgba(239,68,68,0.3)]";
    case "offline": return "border-status-offline border-dashed";
  }
}

export default function PlantSld() {
  const { plantId } = useParams();
  
  const { data: sld, isLoading } = useGetPlantSld(plantId || "", {
    query: {
      enabled: !!plantId,
      refetchInterval: 15000,
      queryKey: getGetPlantSldQueryKey(plantId || "")
    }
  });

  // Very simple hierarchical rendering for demo.
  // In a real app this would use react-flow or a custom canvas diagram.
  const nodesByType = sld?.nodes.reduce((acc, node) => {
    if (!acc[node.type]) acc[node.type] = [];
    acc[node.type].push(node);
    return acc;
  }, {} as Record<string, SldNode[]>) || {};

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full">
        <div>
          <div className="flex items-center mb-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Portfolio</Link>
            <span className="mx-2">/</span>
            <Link href={`/plants/${plantId}`} className="hover:text-foreground transition-colors">Plant Overview</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Single Line Diagram</span>
          </div>
          
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Network className="w-6 h-6 mr-2 text-primary" />
              Live Topology (SLD)
            </h1>
            <div className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-[#0a0a0a] rounded-xl border border-card-border overflow-auto p-8 relative min-h-[600px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin text-primary"><Network className="w-8 h-8" /></div>
            </div>
          ) : (
            <div className="min-w-[800px] flex flex-col items-center space-y-12">
              
              {/* Grid Connection */}
              <div className="flex justify-center w-full">
                {nodesByType['grid']?.map(node => (
                  <SldBox key={node.id} node={node} />
                ))}
              </div>

              {/* Connecting line */}
              <div className="h-12 w-px bg-muted-foreground/30 relative">
                <div className="absolute inset-0 bg-primary/20 animate-pulse-subtle"></div>
              </div>

              {/* Switchyard */}
              <div className="flex justify-center w-full">
                {nodesByType['switchyard']?.map(node => (
                  <SldBox key={node.id} node={node} />
                ))}
              </div>

              {/* Transformers */}
              <div className="h-12 w-px bg-muted-foreground/30"></div>
              <div className="flex justify-center w-full gap-8">
                {nodesByType['transformer']?.map(node => (
                  <div key={node.id} className="flex flex-col items-center">
                    <SldBox node={node} />
                    <div className="h-12 w-px bg-muted-foreground/30"></div>
                    {/* Inverters under this transformer */}
                    <div className="flex gap-4">
                      {nodesByType['inverter']?.filter(inv => inv.parentId === node.id).map(inv => (
                        <div key={inv.id} className="flex flex-col items-center">
                          <SldBox node={inv} link={`/plants/${plantId}/inverters/${inv.id}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function SldBox({ node, link }: { node: SldNode; link?: string }) {
  const Icon = TYPE_ICONS[node.type] || Box;
  
  const content = (
    <div className={`bg-card w-48 border-2 ${NodeStatusBorder({status: node.status})} rounded-lg p-3 flex flex-col items-center text-center relative hover:bg-muted/20 transition-colors`}>
      <Icon className="w-6 h-6 text-muted-foreground mb-2" />
      <span className="font-semibold text-sm truncate w-full">{node.label}</span>
      
      <div className="mt-3 w-full border-t border-border pt-2 grid grid-cols-2 gap-2 text-xs">
        {node.powerKw !== undefined && node.powerKw !== null && (
          <div className="flex flex-col">
            <span className="text-muted-foreground">Power</span>
            <span className="font-mono">{node.powerKw.toFixed(0)} kW</span>
          </div>
        )}
        {node.voltageV !== undefined && node.voltageV !== null && (
          <div className="flex flex-col">
            <span className="text-muted-foreground">Volt</span>
            <span className="font-mono">{node.voltageV.toFixed(0)} V</span>
          </div>
        )}
      </div>
      
      <div className="absolute -top-2 -right-2">
         {node.status === 'fault' && <div className="w-4 h-4 rounded-full bg-status-fault animate-pulse"></div>}
      </div>
    </div>
  );

  if (link) {
    return <Link href={link}>{content}</Link>;
  }
  return content;
}
