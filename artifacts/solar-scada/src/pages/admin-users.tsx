import { useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Users, UserPlus, Shield, CheckCircle2, XCircle } from "lucide-react";

export default function AdminUsers() {
  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() }
  });

  return (
    <AppLayout>
      <div className="flex flex-col space-y-6 h-full">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Users className="w-6 h-6 mr-2 text-primary" />
              User Access Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Role-based access control across the portfolio</p>
          </div>
          <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium flex items-center shadow-sm transition-colors">
            <UserPlus className="w-4 h-4 mr-2" /> Invite User
          </button>
        </div>

        <div className="bg-card border border-card-border rounded-lg overflow-hidden flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-card-border">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Plant Access</th>
                <th className="px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground animate-pulse">Loading users...</td></tr>
              ) : users?.map(user => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 bg-muted rounded border border-border flex w-fit items-center">
                      <Shield className="w-3 h-3 mr-1 text-muted-foreground" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.status === 'active' ? (
                      <span className="text-xs text-status-normal font-medium flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</span>
                    ) : user.status === 'disabled' ? (
                      <span className="text-xs text-status-fault font-medium flex items-center"><XCircle className="w-3 h-3 mr-1" /> Disabled</span>
                    ) : (
                      <span className="text-xs text-status-warning font-medium flex items-center">Invited</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-background border border-border px-1.5 py-0.5 rounded">
                      {user.plantIds.length > 0 ? `${user.plantIds.length} Plants` : 'All Plants'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs font-medium text-primary hover:underline">Edit</button>
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
