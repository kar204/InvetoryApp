import { useEffect, useState } from 'react';
import { Wrench, Package, CheckCircle, AlertTriangle, TrendingUp, Download, Activity, ShoppingCart, Recycle, Store } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentTickets } from '@/components/dashboard/RecentTickets';
import { LowStockAlert } from '@/components/dashboard/LowStockAlert';
import { supabase } from '@/integrations/supabase/client';
import { ServiceTicket, WarehouseStock, Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { downloadCSV, formatDashboardStatsForExport } from '@/utils/exportUtils';

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    openTickets: 0,
    closedToday: 0,
    totalStock: 0,
    lowStockCount: 0,
    inProgressTickets: 0,
    shopStock: 0,
    todaySalesCount: 0,
    todaySalesRevenue: 0,
    scrapInCount: 0,
    scrapInValue: 0,
    todayStockIn: 0,
    todayStockOut: 0,
  });
  const [recentTickets, setRecentTickets] = useState<ServiceTicket[]>([]);
  const [lowStockItems, setLowStockItems] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    const ticketChannel = supabase
      .channel('dashboard-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_tickets' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const stockChannel = supabase
      .channel('dashboard-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      ticketChannel.unsubscribe();
      stockChannel.unsubscribe();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        ticketsRes,
        openRes,
        inProgressRes,
        closedTodayRes,
        stockRes,
        shopStockRes,
        todaySalesRes,
        scrapRes,
        todayStockInRes,
        todayStockOutRes,
      ] = await Promise.all([
        supabase.from('service_tickets').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('service_tickets').select('id', { count: 'exact' }).eq('status', 'OPEN'),
        supabase.from('service_tickets').select('id', { count: 'exact' }).eq('status', 'IN_PROGRESS'),
        supabase.from('service_tickets').select('id', { count: 'exact' }).eq('status', 'CLOSED').gte('updated_at', today.toISOString()),
        supabase.from('warehouse_stock').select('*, product:products(*)'),
        supabase.from('shop_stock').select('quantity'),
        supabase.from('shop_sales').select('id').gte('created_at', today.toISOString()),
        supabase.from('scrap_entries').select('scrap_value, status, quantity'),
        supabase.from('stock_transactions').select('quantity').eq('transaction_type', 'IN').gte('created_at', today.toISOString()),
        supabase.from('stock_transactions').select('quantity').eq('transaction_type', 'OUT').gte('created_at', today.toISOString()),
      ]);

      const stockData = (stockRes.data || []) as (WarehouseStock & { product: Product })[];
      const lowStock = stockData.filter(s => s.quantity < 5);
      const totalStock = stockData.reduce((acc, s) => acc + s.quantity, 0);

      const shopStockTotal = (shopStockRes.data || []).reduce((acc: number, s: any) => acc + (s.quantity || 0), 0);

      // Today's sales revenue: fetch sale items for today's sales
      const todaySaleIds = (todaySalesRes.data || []).map((s: any) => s.id);
      let todaySalesRevenue = 0;
      if (todaySaleIds.length > 0) {
        const { data: saleItems } = await supabase.from('shop_sale_items').select('price, quantity').in('sale_id', todaySaleIds);
        todaySalesRevenue = (saleItems || []).reduce((acc: number, item: any) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
      }

      const scrapEntries = (scrapRes.data || []) as any[];
      const scrapInEntries = scrapEntries.filter(e => e.status === 'IN');
      const scrapInCount = scrapInEntries.reduce((acc: number, e: any) => acc + (e.quantity || 1), 0);
      const scrapInValue = scrapInEntries.reduce((acc: number, e: any) => acc + (e.scrap_value || 0), 0);

      const todayStockIn = (todayStockInRes.data || []).reduce((acc: number, t: any) => acc + (t.quantity || 0), 0);
      const todayStockOut = (todayStockOutRes.data || []).reduce((acc: number, t: any) => acc + (t.quantity || 0), 0);

      setStats({
        openTickets: openRes.data?.length || 0,
        closedToday: closedTodayRes.data?.length || 0,
        totalStock,
        lowStockCount: lowStock.length,
        inProgressTickets: inProgressRes.data?.length || 0,
        shopStock: shopStockTotal,
        todaySalesCount: todaySaleIds.length,
        todaySalesRevenue,
        scrapInCount,
        scrapInValue,
        todayStockIn,
        todayStockOut,
      });

      setRecentTickets((ticketsRes.data as ServiceTicket[]) || []);
      setLowStockItems(lowStock as WarehouseStock[]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-muted-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 animate-spin" />
            Loading dashboard...
          </div>
        </div>
      </AppLayout>
    );
  }

  const handleExportDashboard = () => {
    const data = formatDashboardStatsForExport(stats, new Date());
    downloadCSV(data, `dashboard-report-${new Date().toISOString().split('T')[0]}`);
  };

  const totalActiveTickets = stats.openTickets + stats.inProgressTickets;

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back, {profile?.name || 'User'} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening with your business today.
            </p>
          </div>
          <Button variant="outline" onClick={handleExportDashboard} className="rounded-xl glass">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Overview banner - 4 sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Service */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold text-primary">{totalActiveTickets}</p>
                <p className="text-xs text-muted-foreground">Active Tickets</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-chart-3">{stats.closedToday}</p>
                <p className="text-xs text-muted-foreground">Resolved Today</p>
              </div>
            </div>
          </div>

          {/* Warehouse */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Warehouse</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xl font-bold">{stats.totalStock}</p>
                <p className="text-xs text-muted-foreground">Total Stock</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-chart-3">{stats.todayStockIn}</p>
                <p className="text-xs text-muted-foreground">In Today</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{stats.todayStockOut}</p>
                <p className="text-xs text-muted-foreground">Out Today</p>
              </div>
            </div>
          </div>

          {/* Shop */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Store className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shop</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xl font-bold">{stats.shopStock}</p>
                <p className="text-xs text-muted-foreground">Stock Units</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{stats.todaySalesCount}</p>
                <p className="text-xs text-muted-foreground">Sales Today</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-chart-3">₹{stats.todaySalesRevenue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
            </div>
          </div>

          {/* Scrap */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Recycle className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scrap</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold">{stats.scrapInCount}</p>
                <p className="text-xs text-muted-foreground">In Stock</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-chart-3">₹{stats.scrapInValue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">Value (IN)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatsCard
            title="Open Tickets"
            value={stats.openTickets}
            icon={Wrench}
            variant="primary"
            description="Waiting for assignment"
          />
          <StatsCard
            title="In Progress"
            value={stats.inProgressTickets}
            icon={TrendingUp}
            variant="secondary"
            description="Being worked on"
          />
          <StatsCard
            title="Closed Today"
            value={stats.closedToday}
            icon={CheckCircle}
            variant="success"
            description="Resolved & closed"
          />
          <StatsCard
            title="Total Stock"
            value={stats.totalStock}
            icon={Package}
            variant="default"
            description="Units in warehouse"
          />
          <StatsCard
            title="Low Stock"
            value={stats.lowStockCount}
            icon={AlertTriangle}
            variant={stats.lowStockCount > 0 ? 'warning' : 'default'}
            description="Items below threshold"
          />
        </div>

        {/* Detail panels */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentTickets tickets={recentTickets} />
          <LowStockAlert items={lowStockItems} />
        </div>
      </div>
    </AppLayout>
  );
}
