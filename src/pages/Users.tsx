import { useEffect, useState } from 'react';
import { Plus, Search, Shield, UserCog, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Profile, UserRole, AppRole } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const allRoles: { value: AppRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full system access' },
  { value: 'counter_staff', label: 'Counter Staff (SD)', description: 'Create and manage service tickets' },
  { value: 'sp_battery', label: 'SP Battery', description: 'Handle battery service requests' },
  { value: 'sp_invertor', label: 'SP Invertor', description: 'Handle invertor service requests' },
  { value: 'service_agent', label: 'Service Agent (Legacy)', description: 'Work on assigned tickets' },
  { value: 'warehouse_staff', label: 'Warehouse Staff', description: 'Manage inventory stock' },
  { value: 'procurement_staff', label: 'Procurement Staff', description: 'Add products and manage procurement' },
  { value: 'scrap_manager', label: 'Scrap Manager', description: 'View and manage scrap entries' },
];

const roleColors: Record<AppRole, string> = {
  admin: 'bg-primary/20 text-primary border-primary/30',
  counter_staff: 'bg-secondary/20 text-secondary-foreground border-secondary/30',
  sp_battery: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  sp_invertor: 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  service_agent: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  warehouse_staff: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  procurement_staff: 'bg-chart-4/20 text-chart-4 border-chart-4/30',
  scrap_manager: 'bg-chart-3/20 text-chart-3 border-chart-3/30',
};

export default function Users() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Add user form state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoles, setNewUserRoles] = useState<AppRole[]>([]);
  const [addingUser, setAddingUser] = useState(false);

  const isAdmin = hasRole('admin');

  useEffect(() => {
    fetchData();

    // Set up real-time subscription for profiles and roles
    const profilesChannel = supabase
      .channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData();
      })
      .subscribe();

    const rolesChannel = supabase
      .channel('public:user_roles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(rolesChannel);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('*'),
      ]);

      setProfiles((profilesRes.data as Profile[]) || []);
      setUserRoles((rolesRes.data as UserRole[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUserRoles = (userId: string): AppRole[] => {
    return userRoles.filter(ur => ur.user_id === userId).map(ur => ur.role);
  };

  const openEditRoles = (profile: Profile) => {
    setSelectedUser(profile);
    setSelectedRoles(getUserRoles(profile.user_id));
  };

  const handleSaveRoles = async () => {
    if (!selectedUser) return;

    try {
      // Delete existing roles
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', selectedUser.user_id);

      // Insert new roles
      if (selectedRoles.length > 0) {
        const { error } = await supabase
          .from('user_roles')
          .insert(selectedRoles.map(role => ({
            user_id: selectedUser.user_id,
            role,
          })));

        if (error) throw error;
      }

      toast({ title: 'Roles updated successfully' });
      setSelectedUser(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error updating roles', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);

    try {
      // Delete user roles
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userToDelete.user_id);

      if (rolesError) throw rolesError;

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userToDelete.user_id);

      if (profileError) {
        // If there's a foreign key error, it's because they have activity history
        if (profileError.code === '23503') {
          throw new Error('Cannot delete user because they have recorded activity (tickets, sales, or logs). You should remove their roles instead to revoke access.');
        }
        throw profileError;
      }

      toast({
        title: 'User deleted successfully',
        description: 'The user profile and roles have been removed.'
      });

      // Force immediate local state update in case real-time is slow
      setProfiles(prev => prev.filter(p => p.user_id !== userToDelete.user_id));
      setUserToDelete(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error deleting user', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsDeletingUser(false);
    }
  };

  const toggleRole = (role: AppRole) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const toggleNewUserRole = (role: AppRole) => {
    setNewUserRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserName) return;

    setAddingUser(true);
    try {
      // Sign up the new user
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: newUserName }
        }
      });

      if (error) throw error;

      if (!data.user) {
        throw new Error('User creation failed');
      }

      // Wait a moment for the profile to be created by the trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Assign roles if any selected
      if (newUserRoles.length > 0) {
        const { error: rolesError } = await supabase
          .from('user_roles')
          .insert(newUserRoles.map(role => ({
            user_id: data.user!.id,
            role,
          })));

        if (rolesError) {
          console.error('Error assigning roles:', rolesError);
          // Don't throw, user was created successfully
        }
      }

      toast({ title: 'User created successfully', description: `${newUserName} has been added.` });
      setIsAddUserOpen(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRoles([]);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({
        title: 'Error creating user',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setAddingUser(false);
    }
  };

  const filteredProfiles = profiles.filter(profile =>
    profile.name.toLowerCase().includes(search.toLowerCase()) ||
    profile.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">Manage user roles and permissions</p>
          </div>
          {isAdmin && (
            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-name">Full Name</Label>
                    <Input
                      id="new-name"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Enter full name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-email">Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="Enter email address"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Enter password (min 6 characters)"
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assign Roles (Optional)</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                      {allRoles.map(role => (
                        <div
                          key={role.value}
                          className="flex items-center gap-2 p-2 rounded hover:bg-muted/50"
                        >
                          <Checkbox
                            id={`new-${role.value}`}
                            checked={newUserRoles.includes(role.value)}
                            onCheckedChange={() => toggleNewUserRole(role.value)}
                          />
                          <Label htmlFor={`new-${role.value}`} className="flex-1 cursor-pointer text-sm">
                            {role.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={addingUser}>
                    {addingUser ? 'Creating...' : 'Create User'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading users...</div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#0B0F19]/80 shrink-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 tracking-wide"><Shield className="w-5 h-5 text-[#4F8CFF]" /> User Permissions</h2>
            </div>
            <div className="divide-y divide-white/5">
              {filteredProfiles.length === 0 ? (
                <div className="p-12 text-center text-slate-600 dark:text-slate-500 font-medium flex flex-col items-center justify-center gap-3">
                  <Shield className="h-10 w-10 text-slate-700" />
                  No users found
                </div>
              ) : (
                filteredProfiles.map((profile) => {
                  const roles = getUserRoles(profile.user_id);
                  return (
                    <div key={profile.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-slate-100 dark:bg-[#1B2438] transition-colors duration-200 group gap-4 relative">
                      {/* Active row indicator */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4F8CFF] scale-y-0 group-hover:scale-y-100 transition-transform origin-center" />

                      <div className="flex items-center gap-5 pl-2">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4F8CFF] to-blue-600 flex items-center justify-center text-slate-900 dark:text-white font-bold text-lg shadow-[0_0_15px_rgba(79,140,255,0.3)] group-hover:scale-105 transition-transform shrink-0 ring-2 ring-[#0B0F19]">
                          {profile.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 text-lg tracking-wide group-hover:text-slate-900 dark:hover:text-white transition-colors">{profile.name}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-500 dark:text-slate-400">{profile.email}</div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:w-[55%] justify-between">
                        <div className="flex flex-wrap gap-2">
                          {roles.length === 0 ? (
                            <span className="text-sm text-slate-600 dark:text-slate-500 italic">No roles assigned</span>
                          ) : (
                            roles.map(role => {
                              const isPrimary = role === 'admin' || role === 'procurement_staff';
                              const isSecondary = role.includes('manager') || role.includes('counter');

                              const dotColor = isPrimary ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : isSecondary ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-[#4F8CFF] shadow-[0_0_8px_rgba(79,140,255,0.8)]';
                              const pillBg = isPrimary ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : isSecondary ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-[#4F8CFF]/10 border-[#4F8CFF]/20 text-[#4F8CFF]';

                              return (
                                <div key={role} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${pillBg} font-bold text-[10px] tracking-widest uppercase shadow-sm`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse`} />
                                  {role.replace('_', ' ')}
                                </div>
                              );
                            })
                          )}
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 font-semibold text-slate-600 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/10 rounded-xl transition-all"
                            onClick={() => openEditRoles(profile)}
                            disabled={profile.user_id === user?.id}
                          >
                            <UserCog className="h-4 w-4 mr-2" /> Edit
                          </Button>
                          {isAdmin && profile.user_id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-slate-600 dark:text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                              onClick={() => setUserToDelete(profile)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Edit Roles Dialog */}
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User Roles</DialogTitle>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background">
                    <span className="font-medium">
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{selectedUser.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {allRoles.map(role => (
                    <div
                      key={role.value}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={role.value}
                        checked={selectedRoles.includes(role.value)}
                        onCheckedChange={() => toggleRole(role.value)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={role.value} className="font-medium cursor-pointer">
                          {role.label}
                        </Label>
                        <p className="text-sm text-muted-foreground">{role.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Button onClick={handleSaveRoles} className="w-full">
                  Save Changes
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete <strong>{userToDelete?.name}</strong>'s profile and roles.
                They will no longer have access to the application, but their login account
                will remain in Supabase until manually deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeletingUser}
              >
                {isDeletingUser ? 'Deleting...' : 'Delete User'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
