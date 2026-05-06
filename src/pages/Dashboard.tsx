import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Package, TrendingUp, Download, Activity, ShoppingCart, Recycle, CheckCircle, Battery, Zap, Plug, ShoppingCart as Cart, Sun, Box, Settings } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentTickets } from '@/components/dashboard/RecentTickets';
import { LowStockAlert } from '@/components/dashboard/LowStockAlert';
import { SLATracking } from '@/components/dashboard/SLATracking';
import { supabase } from '@/integrations/supabase/client';
import { ServiceTicket, WarehouseStock, Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { downloadCSV, formatDashboardStatsForExport } from '@/utils/exportUtils';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';

type SalesRange = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface DashboardStats {
  openTickets: number;
  closedToday: number;
  totalStock: number;
  lowStockCount: number;
  inProgressTickets: number;
  homeOpenRequests: number;
  homeInProgressRequests: number;
  homeClosedToday: number;
  todaySalesCount: number;
  todaySalesRevenue: number;
  weekSalesCount: number;
  weekSalesRevenue: number;
  monthSalesCount: number;
  monthSalesRevenue: number;
  scrapInCount: number;
  scrapInValue: number;
  todayStockIn: number;
  todayStockOut: number;
  categoryStock: Record<string, number>;
}

interface SalesTrendPoint {
  name: string;
  Units: number;
}

interface SaleSummaryRow {
  id: string;
  created_at: string;
}

interface SaleItemQuantityRow {
  sale_id: string;
  quantity: number | null;
}

interface SaleRevenueItemRow {
  price: number | null;
  quantity: number | null;
}

interface ScrapSummaryRow {
  scrap_value: number | null;
  status: string | null;
  quantity: number | null;
}

interface StockQuantityRow {
  quantity: number | null;
}

interface TooltipPayloadRow {
  dataKey?: string;
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { name?: string };
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    openTickets: 0,
    closedToday: 0,
    totalStock: 0,
    lowStockCount: 0,
    inProgressTickets: 0,
    homeOpenRequests: 0,
    homeInProgressRequests: 0,
    homeClosedToday: 0,
    todaySalesCount: 0,
    todaySalesRevenue: 0,
    weekSalesCount: 0,
    weekSalesRevenue: 0,
    monthSalesCount: 0,
    monthSalesRevenue: 0,
    scrapInCount: 0,
    scrapInValue: 0,
    todayStockIn: 0,
    todayStockOut: 0,
    categoryStock: {},
  });
  const [salesRange, setSalesRange] = useState<SalesRange>('week');
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [recentTickets, setRecentTickets] = useState<ServiceTicket[]>([]);
  const [lowStockItems, setLowStockItems] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const salesRangeRef = useRef<SalesRange>(salesRange);

  useEffect(() => {
    salesRangeRef.current = salesRange;
  }, [salesRange]);

  const fetchSalesTrend = useCallback(async (range: SalesRange) => {
    try {
      const now = new Date();
      const startDate = new Date();
      let groupFormat: (d: Date) => string;
      let labelFormat: (d: Date) => string;
      const points: Date[] = [];

      if (range === 'day') {
        startDate.setHours(0, 0, 0, 0);
        for (let h = 0; h < 24; h += 3) {
          const point = new Date(startDate);
          point.setHours(h);
          points.push(point);
        }
        groupFormat = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${Math.floor(date.getHours() / 3)}`;
        labelFormat = (date) => `${date.getHours()}:00`;
      } else if (range === 'week') {
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        for (let i = 6; i >= 0; i -= 1) {
          const point = new Date(now);
          point.setDate(now.getDate() - i);
          point.setHours(0, 0, 0, 0);
          points.push(point);
        }
        groupFormat = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        labelFormat = (date) => date.toLocaleDateString('en-IN', { weekday: 'short' });
      } else if (range === 'month') {
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i += 5) {
          points.push(new Date(now.getFullYear(), now.getMonth(), i));
        }
        groupFormat = (date) => `${date.getFullYear()}-${date.getMonth()}-${Math.ceil(date.getDate() / 5)}`;
        labelFormat = (date) => `${date.getDate()} ${date.toLocaleDateString('en-IN', { month: 'short' })}`;
      } else if (range === 'quarter') {
        startDate.setMonth(now.getMonth() - 2);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        for (let i = 2; i >= 0; i -= 1) {
          points.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
        }
        groupFormat = (date) => `${date.getFullYear()}-${date.getMonth()}`;
        labelFormat = (date) => date.toLocaleDateString('en-IN', { month: 'short' });
      } else {
        startDate.setMonth(0);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        for (let i = 0; i < 12; i += 1) {
          points.push(new Date(now.getFullYear(), i, 1));
        }
        groupFormat = (date) => `${date.getFullYear()}-${date.getMonth()}`;
        labelFormat = (date) => date.toLocaleDateString('en-IN', { month: 'short' });
      }

      const { data: salesData } = await supabase
        .from('warehouse_sales')
        .select('id, created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at');

      const saleRows = (salesData || []) as SaleSummaryRow[];
      const saleIds = saleRows.map((sale) => sale.id);
      const itemsBySale: Record<string, number> = {};

      if (saleIds.length > 0) {
        const { data: saleItems } = await supabase
          .from('warehouse_sale_items')
          .select('sale_id, quantity')
          .in('sale_id', saleIds);

        ((saleItems || []) as SaleItemQuantityRow[]).forEach((item) => {
          itemsBySale[item.sale_id] = (itemsBySale[item.sale_id] || 0) + (item.quantity || 0);
        });
      }

      const grouped: Record<string, number> = {};
      saleRows.forEach((sale) => {
        const date = new Date(sale.created_at);
        const key = groupFormat(date);
        grouped[key] = (grouped[key] || 0) + (itemsBySale[sale.id] || 0);
      });

      setSalesTrend(points.map((date) => ({
        name: labelFormat(date),
        Units: grouped[groupFormat(date)] || 0,
      })));
    } catch (err) {
      console.error('Error fetching sales trend:', err);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);

      const monthStart = new Date(today);
      monthStart.setDate(1);

      const [
        ticketsRes,
        openRes,
        inProgressRes,
        closedTodayRes,
        homeOpenRes,
        homeInProgressRes,
        homeClosedTodayRes,
        stockRes,
        todaySalesRes,
        weekSalesRes,
        monthSalesRes,
        scrapRes,
        todayStockInRes,
        todayStockOutRes,
      ] = await Promise.all([
        supabase.from('service_tickets').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('service_tickets').select('id', { count: 'exact' }).eq('status', 'OPEN'),
        supabase.from('service_tickets').select('id', { count: 'exact' }).eq('status', 'IN_PROGRESS'),
        supabase.from('service_tickets').select('id', { count: 'exact' }).eq('status', 'CLOSED').gte('updated_at', today.toISOString()),
        supabase.from('home_service_requests').select('id', { count: 'exact' }).eq('status', 'OPEN'),
        supabase.from('home_service_requests').select('id', { count: 'exact' }).eq('status', 'IN_PROGRESS'),
        supabase.from('home_service_requests').select('id', { count: 'exact' }).eq('status', 'CLOSED').gte('updated_at', today.toISOString()),
        supabase.from('warehouse_stock').select('*, product:products(*)'),
        supabase.from('warehouse_sales').select('id').gte('created_at', today.toISOString()),
        supabase.from('warehouse_sales').select('id').gte('created_at', weekStart.toISOString()),
        supabase.from('warehouse_sales').select('id').gte('created_at', monthStart.toISOString()),
        supabase.from('scrap_entries').select('scrap_value, status, quantity'),
        supabase.from('stock_transactions').select('quantity').eq('transaction_type', 'IN').gte('created_at', today.toISOString()),
        supabase.from('stock_transactions').select('quantity').eq('transaction_type', 'OUT').gte('created_at', today.toISOString()),
      ]);

      const stockData = (stockRes.data || []) as WarehouseStock[];
      const lowStock = stockData.filter((stockItem) => stockItem.quantity < 5);
      const totalStock = stockData.reduce((sum, stockItem) => sum + stockItem.quantity, 0);

      const categoryStock: Record<string, number> = {};
      stockData.forEach((stockItem) => {
        const category = stockItem.product?.category || 'Other';
        categoryStock[category] = (categoryStock[category] || 0) + stockItem.quantity;
      });

      const summarizeSales = async (saleIds: string[]) => {
        let revenue = 0;
        let units = 0;

        if (saleIds.length > 0) {
          const { data: saleItems } = await supabase
            .from('warehouse_sale_items')
            .select('price, quantity')
            .in('sale_id', saleIds);

          const revenueItems = (saleItems || []) as SaleRevenueItemRow[];
          revenue = revenueItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
          units = revenueItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        }

        return { revenue, units };
      };

      const todaySales = await summarizeSales(((todaySalesRes.data || []) as SaleSummaryRow[]).map((sale) => sale.id));
      const weekSales = await summarizeSales(((weekSalesRes.data || []) as SaleSummaryRow[]).map((sale) => sale.id));
      const monthSales = await summarizeSales(((monthSalesRes.data || []) as SaleSummaryRow[]).map((sale) => sale.id));

      const scrapEntries = (scrapRes.data || []) as ScrapSummaryRow[];
      const scrapInEntries = scrapEntries.filter((entry) => entry.status === 'IN');
      const scrapInCount = scrapInEntries.reduce((sum, entry) => sum + (entry.quantity || 1), 0);
      const scrapInValue = scrapInEntries.reduce((sum, entry) => sum + (entry.scrap_value || 0), 0);

      const todayStockIn = ((todayStockInRes.data || []) as StockQuantityRow[]).reduce((sum, row) => sum + (row.quantity || 0), 0);
      const todayStockOut = ((todayStockOutRes.data || []) as StockQuantityRow[]).reduce((sum, row) => sum + (row.quantity || 0), 0);

      setStats({
        openTickets: openRes.data?.length || openRes.count || 0,
        closedToday: closedTodayRes.data?.length || closedTodayRes.count || 0,
        totalStock,
        lowStockCount: lowStock.length,
        inProgressTickets: inProgressRes.data?.length || inProgressRes.count || 0,
        homeOpenRequests: homeOpenRes.data?.length || homeOpenRes.count || 0,
        homeInProgressRequests: homeInProgressRes.data?.length || homeInProgressRes.count || 0,
        homeClosedToday: homeClosedTodayRes.data?.length || homeClosedTodayRes.count || 0,
        todaySalesCount: todaySales.units,
        todaySalesRevenue: todaySales.revenue,
        weekSalesCount: weekSales.units,
        weekSalesRevenue: weekSales.revenue,
        monthSalesCount: monthSales.units,
        monthSalesRevenue: monthSales.revenue,
        scrapInCount,
        scrapInValue,
        todayStockIn,
        todayStockOut,
        categoryStock,
      });

      setRecentTickets((ticketsRes.data as unknown as ServiceTicket[]) || []);
      setLowStockItems(lowStock);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    const ticketChannel = supabase
      .channel('dashboard-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_tickets' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const homeServiceChannel = supabase
      .channel('dashboard-home-service')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_service_requests' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const stockChannel = supabase
      .channel('dashboard-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    const saleChannel = supabase
      .channel('dashboard-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_sales' }, () => {
        fetchDashboardData();
        fetchSalesTrend(salesRangeRef.current);
      })
      .subscribe();

    return () => {
      ticketChannel.unsubscribe();
      homeServiceChannel.unsubscribe();
      stockChannel.unsubscribe();
      saleChannel.unsubscribe();
    };
  }, [fetchDashboardData, fetchSalesTrend]);

  useEffect(() => {
    fetchSalesTrend(salesRange);
  }, [fetchSalesTrend, salesRange]);

  // Fallback polling (helps when realtime is delayed or client missed an event)
  usePollingRefresh(fetchDashboardData, 60000);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const greeting = getGreeting();

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

  const salesHasValues = salesTrend.some((entry) => entry.Units > 0);

  const ticketSplitData = [
    { name: 'OPEN', in_shop: stats.openTickets, home: stats.homeOpenRequests },
    { name: 'IN_PROGRESS', in_shop: stats.inProgressTickets, home: stats.homeInProgressRequests },
    { name: 'CLOSED_TODAY', in_shop: stats.closedToday, home: stats.homeClosedToday },
  ];

  const stockMoveData = [
    { name: 'Stock In', value: stats.todayStockIn },
    { name: 'Sale', value: stats.todaySalesCount }
  ];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayloadRow[] }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-50 dark:bg-[#0B0F19]/90 border border-slate-200 dark:border-white/10 p-3 rounded-lg shadow-xl backdrop-blur-md">
          <p className="text-slate-900 dark:text-white text-xs font-bold">{payload[0].payload?.name}</p>
          {payload.map((item) => (
            <p key={item.dataKey} className="text-sm font-bold mt-1" style={{ color: item.color }}>
              {item.name}: {item.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-300 gpu-smooth">
        {/* Header */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-1">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white drop-shadow-lg">
                {greeting}, <span className="bg-gradient-to-r from-[#4F8CFF] via-[#7487FF] to-[#22C55E] bg-clip-text text-transparent capitalize">{profile?.name || 'User'}</span>
              </h1>
              <p className="text-slate-600 dark:text-slate-500 mt-2 text-[15px] font-medium flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Everything looks stable. Here is your latest business snapshot.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleExportDashboard} className="rounded-xl border-slate-200 dark:border-white/10 bg-white/50 dark:bg-[#1B2438]/50 hover:bg-white dark:hover:bg-[#1B2438] text-slate-900 dark:text-white backdrop-blur-md transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02]">
                <Download className="h-4 w-4 mr-2 text-[#4F8CFF]" />
                Export Data
              </Button>
            </div>
          </div>

        </div>

        {/* Hero Metrics */}
        <div className="grid gap-4 sm:gap-6 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <StatsCard
            title="Active Tickets"
            value={stats.openTickets + stats.inProgressTickets}
            icon={Wrench}
            variant="warning"
            trend={stats.closedToday > 0 ? "up" : "neutral"}
            trendValue={`${stats.closedToday} closed`}
          />
          <StatsCard
            title="Closed Today"
            value={stats.closedToday}
            icon={CheckCircle}
            variant="primary"
            trend={stats.closedToday > 0 ? "up" : "neutral"}
            trendValue={`${stats.openTickets} open`}
          />
          <StatsCard
            title="Sales Today"
            value={stats.todaySalesCount}
            icon={TrendingUp}
            variant="success"
            trend={stats.todaySalesCount > 0 ? "up" : "neutral"}
            trendValue={`Rs. ${stats.todaySalesRevenue.toLocaleString('en-IN')}`}
          />
          <StatsCard
            title="Sales This Week"
            value={stats.weekSalesCount}
            icon={TrendingUp}
            variant="success"
            trend={stats.weekSalesCount > 0 ? "up" : "neutral"}
            trendValue={`Rs. ${stats.weekSalesRevenue.toLocaleString('en-IN')}`}
          />
          <StatsCard
            title="Sales This Month"
            value={stats.monthSalesCount}
            icon={TrendingUp}
            variant="success"
            trend={stats.monthSalesCount > 0 ? "up" : "neutral"}
            trendValue={`Rs. ${stats.monthSalesRevenue.toLocaleString('en-IN')}`}
          />
          <StatsCard
            title="Scrap In Stock"
            value={stats.scrapInCount}
            icon={Recycle}
            variant="secondary"
            trend="up"
            trendValue={`${stats.scrapInCount} units in`}
          />
        </div>

        {/* Category-wise Stock Breakdown - full width */}
        <div className="glass-card rounded-2xl p-6 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 shadow-md hover:shadow-xl hover:border-[#4F8CFF]/30 transition-all duration-150 ease-out gpu-smooth">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-8 w-8 rounded-xl bg-[#4F8CFF]/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-[#4F8CFF]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Stock by Category</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total inventory across all warehouse categories</p>
            </div>
            <div className="ml-auto text-right">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalStock}</span>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Units</p>
            </div>
          </div>
          <div className="overflow-x-auto pb-2 styled-scrollbar">
            <div className="flex min-w-max gap-3">
            {['Battery', 'Inverter', 'UPS', 'Trolly', 'Solar Panel', 'Charger', 'SMF', 'Spares'].map((cat) => {
              const count = stats.categoryStock[cat] || 0;
              const maxCount = Math.max(...Object.values(stats.categoryStock), 1);
              const pct = Math.round((count / maxCount) * 100);
              const catColors: Record<string, { bg: string, text: string, bar: string, icon: React.ReactNode }> = {
                'Battery': { bg: 'bg-blue-500/10', text: 'text-blue-400', bar: 'bg-blue-500', icon: <Battery className="w-5 h-5 text-blue-500" /> },
                'Inverter': { bg: 'bg-violet-500/10', text: 'text-violet-400', bar: 'bg-violet-500', icon: <Zap className="w-5 h-5 text-violet-500" /> },
                'UPS': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-500', icon: <Plug className="w-5 h-5 text-emerald-500" /> },
                'Trolly': { bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-500', icon: <Cart className="w-5 h-5 text-amber-500" /> },
                'Solar Panel': { bg: 'bg-orange-500/10', text: 'text-orange-400', bar: 'bg-orange-500', icon: <Sun className="w-5 h-5 text-orange-500" /> },
                'Charger': { bg: 'bg-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-500', icon: <Plug className="w-5 h-5 text-rose-500" /> },
                'SMF': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', bar: 'bg-cyan-500', icon: <Box className="w-5 h-5 text-cyan-500" /> },
                'Spares': { bg: 'bg-slate-500/10', text: 'text-slate-300 dark:text-slate-200', bar: 'bg-slate-400', icon: <Settings className="w-5 h-5 text-slate-400" /> },
              };
              const style = catColors[cat] || { bg: 'bg-slate-500/10', text: 'text-slate-400', bar: 'bg-slate-500', icon: <Package className="w-5 h-5 text-slate-400" /> };
              return (
                <div key={cat} className={`${style.bg} min-w-[185px] shrink-0 rounded-xl p-4 flex flex-col gap-2 border border-white/5 hover:scale-[1.02] transition-transform duration-200`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg flex items-center justify-center">{style.icon}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>{cat}</span>
                  </div>
                  <div className={`text-3xl font-bold ${style.text}`}>{count}</div>
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full ${style.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500">units</span>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Visual Intelligence Charts */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sales Trend - Interactive */}
          <div className="glass-card rounded-2xl p-6 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 shadow-md flex flex-col min-h-[320px] hover:-translate-y-1 hover:shadow-xl hover:border-[#4F8CFF]/50 transition-all duration-150 ease-out group col-span-1 lg:col-span-1 gpu-smooth">
            <div className="w-full mb-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-[#4F8CFF]" /> Sales Trend</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Unit sales over time</p>
                </div>
                {/* Range selector */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0B0F19]/60 p-1 rounded-lg border border-slate-200 dark:border-white/5">
                  {(['day', 'week', 'month', 'quarter', 'year'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setSalesRange(r)}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all duration-200 ${salesRange === r
                          ? 'bg-[#4F8CFF] text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                        }`}
                    >
                      {r === 'day' ? 'Day' : r === 'week' ? 'Week' : r === 'month' ? 'Month' : r === 'quarter' ? 'Quarter' : 'Year'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-full flex-1 h-[200px] relative">
              {!salesHasValues && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No sales data for this range
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend.length ? salesTrend : [{ name: 'No data', Units: 0 }]} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(79,140,255,0.2)', strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="Units" stroke={salesHasValues ? "#4F8CFF" : "rgba(148,163,184,0.35)"} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#4F8CFF', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tickets Overview Bar - moved second */}
          <div className="glass-card rounded-2xl p-6 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 shadow-md flex flex-col min-h-[320px] hover:-translate-y-1 hover:shadow-xl hover:border-[#4F8CFF]/50 transition-all duration-150 ease-out group gpu-smooth">
            <div className="w-full mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2"><Wrench className="w-4 h-4 text-[#4F8CFF]" /> Ticket Status Distribution</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">In-Shop vs Home Service breakdown</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 max-h-24 overflow-y-auto pr-1 styled-scrollbar">
              <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[12px] font-semibold text-amber-500">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                In-Shop OPEN {stats.openTickets}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#4F8CFF]/20 bg-[#4F8CFF]/10 px-3 py-1 text-[12px] font-semibold text-[#4F8CFF]">
                <span className="h-2 w-2 rounded-full bg-[#4F8CFF]" />
                In-Shop IN_PROGRESS {stats.inProgressTickets}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                In-Shop CLOSED today {stats.closedToday}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold text-violet-400">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                Home OPEN {stats.homeOpenRequests}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[12px] font-semibold text-sky-400">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Home IN_PROGRESS {stats.homeInProgressRequests}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-[12px] font-semibold text-teal-400">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                Home CLOSED today {stats.homeClosedToday}
              </div>
            </div>
            <div className="w-full h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketSplitData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v === 'CLOSED_TODAY' ? 'CLOSED (Today)' : v.replace('_', ' '))}
                  />
                  <YAxis hide />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  <Bar dataKey="in_shop" name="In-Shop" fill="#4F8CFF" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="home" name="Home" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Stock Movement */}
          <div className="glass-card rounded-2xl p-6 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 shadow-md flex flex-col min-h-[320px] hover:-translate-y-1 hover:shadow-xl hover:border-[#4F8CFF]/50 transition-all duration-150 ease-out group gpu-smooth">
            <div className="w-full mb-6">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Stock Movement</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">Total units moved today</p>
            </div>
            <div className="w-full h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockMoveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {
                      stockMoveData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#22C55E' : '#EF4444'} />
                      ))
                    }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Detail panels */}
        <div className="grid gap-6 lg:grid-cols-2 mt-4">
          <RecentTickets tickets={recentTickets} />
          <LowStockAlert items={lowStockItems} />
        </div>

        {/* SLA Tracking Dashboard */}
        <div className="mt-8">
          <SLATracking />
        </div>
      </div>
    </AppLayout>
  );
}
