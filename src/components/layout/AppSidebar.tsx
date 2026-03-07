import {
  LayoutDashboard,
  Wrench,
  Package,
  ClipboardList,
  Users,
  LogOut,
  Recycle
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const menuItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'warehouse_staff', 'procurement_staff'] },
  { title: 'Service Tickets', icon: Wrench, path: '/services', roles: ['admin', 'counter_staff', 'service_agent', 'sp_battery', 'sp_invertor'] },
  { title: 'Inventory', icon: Package, path: '/inventory', roles: ['admin', 'warehouse_staff', 'procurement_staff'] },
  { title: 'Scrap', icon: Recycle, path: '/scrap', roles: ['admin', 'scrap_manager'] },
  { title: 'Transactions', icon: ClipboardList, path: '/transactions', roles: ['admin', 'warehouse_staff', 'procurement_staff'] },
  { title: 'Users', icon: Users, path: '/users', roles: ['admin'] },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, roles, signOut, hasAnyRole } = useAuth();

  const filteredMenuItems = menuItems.filter(item =>
    hasAnyRole(item.roles as any[])
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <Sidebar className="border-r border-slate-200 dark:border-transparent bg-slate-50 dark:bg-[#0B0F19] transition-all duration-300 ease-in-out group/sidebar shadow-xl dark:shadow-none">
      <SidebarHeader className="p-4 border-b border-slate-200 dark:border-white/[0.04] bg-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F8CFF]/20 to-[#4F8CFF]/5 shadow-[0_0_15px_rgba(79,140,255,0.15)] overflow-hidden border border-[#4F8CFF]/20">
            <img
              src="/afsal-logo.png"
              alt="Afsal Traders logo"
              className="h-8 w-8 object-contain drop-shadow"
            />
          </div>
          <div className="flex flex-col overflow-hidden transition-opacity duration-300">
            <span className="font-semibold text-slate-900 dark:text-white tracking-wide text-sm leading-tight">BatteryPro</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
              <span className="text-[10px] text-slate-600 dark:text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Workspace</span>
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-transparent pt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-600 dark:text-slate-500/70 text-[10px] font-bold uppercase tracking-[0.15em] mb-2 px-4 transition-all group-data-[state=collapsed]/sidebar:opacity-0 group-data-[state=collapsed]/sidebar:-translate-x-2">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2 space-y-1">
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                    className="cursor-pointer group relative flex items-center rounded-lg transition-all duration-200 overflow-hidden text-slate-600 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:bg-[#1B2438] data-[active=true]:bg-gradient-to-r data-[active=true]:from-[#4F8CFF]/15 data-[active=true]:to-transparent data-[active=true]:text-[#4F8CFF]"
                  >
                    {location.pathname === item.path && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#4F8CFF] rounded-r-full shadow-[0_0_10px_rgba(79,140,255,0.6)]" />
                    )}
                    <item.icon className={`h-4 w-4 shrink-0 transition-all duration-200 ${location.pathname === item.path ? 'drop-shadow-[0_0_8px_rgba(79,140,255,0.5)]' : 'group-hover:scale-110'}`} />
                    <span className="font-medium tracking-wide text-sm ml-3">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

    </Sidebar>
  );
}
