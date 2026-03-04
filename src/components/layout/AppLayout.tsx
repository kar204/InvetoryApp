import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, LayoutDashboard, Wrench, Package, ClipboardList, Users, LogOut, Recycle, ShoppingCart, AlertTriangle, X, CheckCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useState, useEffect, useRef } from 'react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string, title: string, desc: string, time: Date, type: 'sale' | 'alert' | 'info' }[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  useEffect(() => {
    // Listen for new sales
    const salesChannel = supabase
      .channel('public:warehouse_sales:layout')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warehouse_sales' },
        (payload) => {
          const amount = payload.new.total_amount?.toLocaleString() || 0;
          toast({
            title: "New Sale Recorded",
            description: `A sale of ₹${amount} was just recorded.`,
          });
          setNotifications(prev => [{
            id: `sale-${Date.now()}`,
            title: 'New Sale Recorded',
            desc: `A sale of ₹${amount} was recorded.`,
            time: new Date(),
            type: 'sale' as const,
          }, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    // Listen for stock drops
    const stockChannel = supabase
      .channel('public:warehouse_stock:layout')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'warehouse_stock' },
        (payload) => {
          // Check if quantity dropped to critical
          if (payload.new.quantity <= 5 && payload.old.quantity > 5) {
            toast({
              title: "Low Stock Alert 🚨",
              description: `A product has dropped to critical stock levels (${payload.new.quantity} left).`,
              variant: "destructive",
            });
            setNotifications(prev => [{
              id: `stock-${Date.now()}`,
              title: 'Low Stock Alert',
              desc: `A product dropped to critical stock (${payload.new.quantity} left).`,
              time: new Date(),
              type: 'alert' as const,
            }, ...prev].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(stockChannel);
    };
  }, [toast]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getPageContext = () => {
    const path = location.pathname.split('/')[1] || 'dashboard';
    const title = path.charAt(0).toUpperCase() + path.slice(1);
    const subtext = (() => {
      switch (path) {
        case 'dashboard': return 'Overview of your business metrics';
        case 'services': return 'Manage incoming service requests';
        case 'inventory': return 'Warehouse stock and product management';
        case 'scrap': return 'Track scrap batteries and salvage value';
        case 'transactions': return 'Detailed ledger of all movements';
        case 'users': return 'Manage team access and roles';
        default: return 'BatteryPro Management System';
      }
    })();
    return { title, subtext };
  };

  const { title, subtext } = getPageContext();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-white selection:bg-[#4F8CFF]/30">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 w-full overflow-hidden relative">

          {/* Subtle background radial glow */}
          <div className="absolute top-[-15%] left-[-10%] w-[60%] h-[60%] bg-[#4F8CFF]/[0.03] blur-[120px] rounded-full pointer-events-none" />

          <header className="sticky top-0 z-50 flex h-20 items-center justify-between gap-4 px-6 md:px-10 border-b border-white/[0.04] bg-slate-50 dark:bg-[#0B0F19]/70 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-50 dark:bg-[#0B0F19]/40">
            {/* Left */}
            <div className="flex items-center gap-4 flex-1">
              <SidebarTrigger className="lg:hidden text-slate-600 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" />
              <div className="hidden md:flex flex-col">
                <h1 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white drop-shadow-sm">{title}</h1>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{subtext}</p>
              </div>
            </div>

            {/* Center - Search */}
            <div className="flex-1 max-w-[320px] hidden lg:flex items-center justify-center">
              <button
                onClick={() => setOpen(true)}
                className="w-full relative flex items-center pl-10 pr-16 bg-white dark:bg-[#111827]/80 border border-slate-200 dark:border-white/5 text-sm text-slate-600 dark:text-slate-500 dark:text-slate-400 placeholder:text-slate-600 dark:text-slate-500 rounded-full h-10 hover:bg-white dark:bg-[#111827] hover:text-slate-900 dark:hover:text-white hover:border-[#4F8CFF]/40 outline-none focus-visible:ring-1 focus-visible:ring-[#4F8CFF]/40 shadow-inner transition-all duration-300 group"
              >
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 dark:text-slate-500 group-hover:text-[#4F8CFF]" />
                <span>Global search...</span>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <kbd className="inline-flex items-center text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#1B2438] px-1.5 py-0.5 rounded shadow-sm border border-slate-200 dark:border-white/10 uppercase font-mono tracking-tighter">Ctrl K</kbd>
                </div>
              </button>
            </div>

            {/* Right */}
            <div className="flex flex-1 items-center justify-end gap-3 sm:gap-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpen(true)}
                  className="lg:hidden relative p-2.5 text-slate-600 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/5 rounded-full transition-all group"
                >
                  <Search className="h-5 w-5 hover:scale-110 duration-300" />
                </button>

                {/* Notification Bell Panel */}
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setNotifOpen(o => !o)}
                    className="relative p-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all duration-200 group"
                  >
                    <Bell className="h-5 w-5 transition-transform group-hover:rotate-12 group-hover:scale-110 duration-300" />
                    {notifications.length > 0 && (
                      <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 border-2 border-slate-50 dark:border-[#0B0F19]"></span>
                      </span>
                    )}
                  </button>

                  {/* Notification Dropdown Panel */}
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
                        <div className="flex items-center gap-2">
                          <Bell className="h-4 w-4 text-[#4F8CFF]" />
                          <span className="text-sm font-bold text-slate-900 dark:text-white">Notifications</span>
                          {notifications.length > 0 && (
                            <span className="text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded-full">{notifications.length}</span>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          {notifications.length > 0 && (
                            <button
                              onClick={() => setNotifications([])}
                              className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <CheckCheck className="h-3 w-3" /> Clear all
                            </button>
                          )}
                          <button onClick={() => setNotifOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Notification List */}
                      <div className="max-h-80 overflow-y-auto styled-scrollbar">
                        {notifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                            <Bell className="h-8 w-8 opacity-30" />
                            <p className="text-sm font-medium">All caught up!</p>
                            <p className="text-xs text-slate-500">New sales and stock alerts will appear here.</p>
                          </div>
                        ) : (
                          notifications.map(n => (
                            <div key={n.id} className="flex items-start gap-3 p-3 border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group/notif">
                              <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${n.type === 'sale' ? 'bg-emerald-500/10 text-emerald-400' : n.type === 'alert' ? 'bg-rose-500/10 text-rose-400' : 'bg-[#4F8CFF]/10 text-[#4F8CFF]'}`}>
                                {n.type === 'sale' ? <ShoppingCart className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{n.desc}</p>
                                <p className="text-[10px] text-slate-400 mt-1">{n.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              <button
                                onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
                                className="opacity-0 group-hover/notif:opacity-100 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-5 w-px bg-white/10 mx-1"></div>

                <div className="scale-90 opacity-80 hover:opacity-100 transition-opacity">
                  <ThemeToggle />
                </div>

                <div className="flex items-center gap-2 pl-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-9 w-9 rounded-full bg-gradient-to-br from-[#4F8CFF] to-indigo-600 p-[2px] shadow-[0_0_15px_rgba(79,140,255,0.15)] group cursor-pointer hover:shadow-[0_0_20px_rgba(79,140,255,0.25)] transition-all outline-none">
                        <div className="h-full w-full rounded-full bg-slate-50 dark:bg-[#0B0F19] flex items-center justify-center">
                          <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:scale-110 transition-transform">{profile?.name?.charAt(0).toUpperCase() || 'U'}</span>
                        </div>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 mt-2 bg-white dark:bg-[#111827] border-slate-200 dark:border-white/10 shadow-xl rounded-xl">
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1 p-1">
                          <p className="text-sm font-medium leading-none text-slate-900 dark:text-white">{profile?.name || 'User'}</p>
                          <p className="text-xs leading-none text-muted-foreground mt-1">
                            {roles.length > 0 ? roles[0].replace('_', ' ') : 'No role assigned'}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-400 focus:text-red-400 hover:bg-red-400/10 focus:bg-red-400/10 rounded-md px-3 py-2">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </header>

          <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Type a command or search modules..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Quick Navigation">
                <CommandItem onSelect={() => { setOpen(false); navigate('/dashboard') }}>
                  <LayoutDashboard className="mr-2 h-4 w-4 text-[#4F8CFF]" />
                  <span>Dashboard</span>
                </CommandItem>
                <CommandItem onSelect={() => { setOpen(false); navigate('/services') }}>
                  <Wrench className="mr-2 h-4 w-4 text-emerald-400" />
                  <span>Service Tickets</span>
                </CommandItem>
                <CommandItem onSelect={() => { setOpen(false); navigate('/inventory') }}>
                  <Package className="mr-2 h-4 w-4 text-amber-500" />
                  <span>Inventory</span>
                </CommandItem>
                <CommandItem onSelect={() => { setOpen(false); navigate('/scrap') }}>
                  <Recycle className="mr-2 h-4 w-4 text-indigo-400" />
                  <span>Scrap Management</span>
                </CommandItem>
                <CommandItem onSelect={() => { setOpen(false); navigate('/transactions') }}>
                  <ClipboardList className="mr-2 h-4 w-4 text-rose-400" />
                  <span>Transactions</span>
                </CommandItem>
                {hasAnyRole && hasAnyRole(['admin']) && (
                  <CommandItem onSelect={() => { setOpen(false); navigate('/users') }}>
                    <Users className="mr-2 h-4 w-4 text-purple-400" />
                    <span>User Management</span>
                  </CommandItem>
                )}
              </CommandGroup>
              <CommandGroup heading="Actions">
                <CommandItem onSelect={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4 text-slate-600 dark:text-slate-500" />
                  <span>Sign Out completely</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>

          <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10 z-10 w-full scroll-auto">
            <div className="mx-auto max-w-7xl w-full h-full pb-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
