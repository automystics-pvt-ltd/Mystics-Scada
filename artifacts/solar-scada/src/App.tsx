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
import InsightsPage from '@/pages/insights';
import AdminUsers from '@/pages/admin-users';
import AdminRoles from '@/pages/admin-roles';
import Settings from '@/pages/settings';
import NotFound from '@/pages/not-found';
import SuperAdminDashboard from '@/pages/superadmin-dashboard';
import SuperAdminOrgs from '@/pages/superadmin-orgs';
import SuperAdminOrgDetail from '@/pages/superadmin-org-detail';
import DevicesPage from '@/pages/devices';
import DeviceDetailPage from '@/pages/device-detail';
import DeviceTemplatesPage from '@/pages/device-templates';
import DeviceTemplateBuilderPage from '@/pages/device-template-builder';
import DriverHealthPage from '@/pages/driver-health';
import DataConnectorWizardPage from '@/pages/data-connector-wizard';
import AutoProvisionWizardPage from '@/pages/autoprovision-wizard';
import FtpSourcesPage from '@/pages/ftp-sources';
import OrgProfilePage from '@/pages/org-profile';
import OrgUsersPage from '@/pages/org-users';
import OrgNotificationsPage from '@/pages/org-notifications';
import OrgAuditLogPage from '@/pages/org-audit-log';
import PlantZones from '@/pages/plant-zones';
import PlantZoneDetail from '@/pages/plant-zone-detail';
import PlantZoneArrays from '@/pages/plant-zone-arrays';
import PlantZoneArrayDetail from '@/pages/plant-zone-array-detail';
import { ControlRoomProvider } from '@/context/ControlRoomContext';

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
          <Route path="/plants/:plantId/zones" component={PlantZones} />
          <Route path="/plants/:plantId/zones/:zoneId/arrays/:arrayId" component={PlantZoneArrayDetail} />
          <Route path="/plants/:plantId/zones/:zoneId/arrays" component={PlantZoneArrays} />
          <Route path="/plants/:plantId/zones/:zoneId" component={PlantZoneDetail} />
          <Route path="/plants/:plantId/weather" component={WeatherView} />
          <Route path="/plants/:plantId/analytics" component={AnalyticsView} />
          <Route path="/alerts" component={AlertCenter} />
          <Route path="/maintenance" component={MaintenanceBoard} />
          <Route path="/reports" component={ReportsView} />
          <Route path="/insights" component={InsightsPage} />
          <Route path="/devices" component={DevicesPage} />
          <Route path="/devices/:id" component={DeviceDetailPage} />
          <Route path="/device-templates" component={DeviceTemplatesPage} />
          <Route path="/device-templates/new" component={DeviceTemplateBuilderPage} />
          <Route path="/device-templates/:id/edit" component={DeviceTemplateBuilderPage} />
          <Route path="/driver-health" component={DriverHealthPage} />
          <Route path="/connect-data-source" component={DataConnectorWizardPage} />
          <Route path="/autoprovision" component={AutoProvisionWizardPage} />
          <Route path="/ftp-sources" component={FtpSourcesPage} />
          <Route path="/org" component={OrgProfilePage} />
          <Route path="/org/users" component={OrgUsersPage} />
          <Route path="/org/notifications" component={OrgNotificationsPage} />
          <Route path="/org/audit-log" component={OrgAuditLogPage} />
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
      <ControlRoomProvider>
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
      </ControlRoomProvider>
    </ThemeProvider>
  );
}

export default App;
