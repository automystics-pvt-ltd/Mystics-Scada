import { useListReports, getListReportsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { FileText, Download, Play, Calendar, Settings } from "lucide-react";

export default function ReportsView() {
  const { data: reports, isLoading } = useListReports({
    query: { queryKey: getListReportsQueryKey() }
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <FileText className="w-6 h-6 mr-2 text-primary" />
              Reporting Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Scheduled and on-demand plant performance reports</p>
          </div>
          <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium flex items-center shadow-sm transition-colors">
            <Play className="w-4 h-4 mr-2" /> Generate Now
          </button>
        </div>

        <div className="bg-card border border-card-border rounded-lg overflow-hidden flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-card-border">
              <tr>
                <th className="px-4 py-3 font-medium">Report Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Last Generated</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading reports...</td></tr>
              ) : reports?.map(report => (
                <tr key={report.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{report.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 bg-muted rounded border border-border capitalize">
                      {report.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 bg-background border border-border rounded font-mono uppercase">
                      {report.format}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {report.lastGeneratedAt ? new Date(report.lastGeneratedAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {report.status === 'ready' ? (
                      <span className="text-xs text-status-normal font-medium flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Ready</span>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center"><Calendar className="w-3 h-3 mr-1" /> Scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded" title="Configure">
                        <Settings className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded" title="Download Last">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
import { CheckCircle } from "lucide-react";