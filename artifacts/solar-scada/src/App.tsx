import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import { TelemetryStreamProvider } from '@/context/TelemetryStreamContext';
import { AuthProvider } from '@/context/AuthContext';
import { AuthGuard } from '@/components/auth-guard';

// Pages
import PortfolioDashboard from '@/pages/portfolio';
import Login from '@/pages/login';
import PlantDashboard from '@/pages/plant-dashboard';
import PlantSld from '@/pages/plant-sld';
import InverterList from '@/pages/inverter-list';
import InverterDetail from '@/pages/inverter-detail';
import StringDiagnostics from '@/pages/string-diagnostics';
import CombinerStrings from '@/pages/combiner-strings';
import WeatherView from '@/pages/weather';
import AnalyticsView from '@/pages/analytics';
import AlertCenter from '@/pages/alerts';
import MaintenanceBoard from '@/pages/maintenance';
import ReportsView from '@/pages/reports';
import AdminUsers from '@/pages/admin-users';
import AdminRoles from '@/pages/admin-roles';
import Settings from '@/pages/settings';
import NotFound from '@/pages/not-found';
import SuperAdminDashboard from '@/pages/superadmin-dashboard';
import SuperAdminOrgs from '@/pages/superadmin-orgs';
import SuperAdminOrgDetail from '@/pages/superadmin-org-detail';

const queryClient = new QueryClient();

function ProtectedRoutes() {
  return (
    <AuthGuard>
      <TelemetryStreamProvider>
        <Switch>
          <Route path="/" component={PortfolioDashboard} />
          <Route path="/plants/:plantId" component={PlantDashboard} />
          <Route path="/plants/:plantId/sld" component={PlantSld} />
          <Route path="/plants/:plantId/inverters" component={InverterList} />
          <Route path="/plants/:plantId/inverters/:inverterId" component={InverterDetail} />
          <Route path="/plants/:plantId/inverters/:inverterId/strings" component={StringDiagnostics} />
          <Route path="/plants/:plantId/combiners/:combinerId/strings" component={CombinerStrings} />
          <Route path="/plants/:plantId/weather" component={WeatherView} />
          <Route path="/plants/:plantId/analytics" component={AnalyticsView} />
          <Route path="/alerts" component={AlertCenter} />
          <Route path="/maintenance" component={MaintenanceBoard} />
          <Route path="/reports" component={ReportsView} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/roles" component={AdminRoles} />
          <Route path="/settings" component={Settings} />
          <Route path="/superadmin" component={SuperAdminDashboard} />
          <Route path="/superadmin/orgs" component={SuperAdminOrgs} />
          <Route path="/superadmin/orgs/:orgId" component={SuperAdminOrgDetail} />
          <Route component={NotFound} />
        </Switch>
      </TelemetryStreamProvider>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      {/* Login is always public — outside the AuthGuard */}
      <Route path="/login" component={Login} />
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
