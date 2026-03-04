import { useEffect, useState, useRef } from 'react';
import { Plus, Minus, Search, Package, ArrowUpCircle, ArrowDownCircle, Download, Trash2, X, Upload, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Product, WarehouseStock, TransactionType, StockSource } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { downloadCSV, formatStockForExport } from '@/utils/exportUtils';
import * as XLSX from 'xlsx';
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

export default function Inventory() {
  const { user, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isStockTransferOpen, setIsStockTransferOpen] = useState(false);
  const [isRecordSaleOpen, setIsRecordSaleOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'sales'>('inventory');
  const [sales, setSales] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [stockTransactions, setStockTransactions] = useState<any[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<'sales' | 'transfers'>('sales');
  const [profiles, setProfiles] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transferProductSearch, setTransferProductSearch] = useState('');
  const [saleProductSearch, setSaleProductSearch] = useState('');

  // Product form
  const [productForm, setProductForm] = useState({
    name: '',
    model: '',
    capacity: '',
    category: 'Battery',
    initialQuantity: '',
  });

  // Stock transfer form (Simplified to Stock In only)
  const [transferForm, setTransferForm] = useState({
    transaction_type: 'IN' as TransactionType,
    source: 'WAREHOUSE' as StockSource,
    remarks: '',
  });

  // Sale form
  const [saleForm, setSaleForm] = useState({
    customer_name: '',
    payment_method: 'CASH',
  });

  const [transferItems, setTransferItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [saleItems, setSaleItems] = useState<{ productId: string; quantity: number; price: number }[]>([]);

  // Role-based restrictions
  const isWarehouseStaff = hasRole('warehouse_staff');
  const isProcurementStaff = hasRole('procurement_staff');
  const isAdmin = hasRole('admin');

  useEffect(() => {
    fetchData();
    fetchSales();
    fetchStockTransactions();
    fetchProfiles();

    const stockChannel = supabase
      .channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        fetchData();
      })
      .subscribe();

    const salesChannel = supabase
      .channel('sales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_sales' }, () => {
        fetchSales();
      })
      .subscribe();

    const transactionsChannel = supabase
      .channel('transactions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transactions' }, () => {
        fetchStockTransactions();
      })
      .subscribe();

    return () => {
      stockChannel.unsubscribe();
      salesChannel.unsubscribe();
      transactionsChannel.unsubscribe();
    };
  }, []);

  const fetchProfiles = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*');
      setProfiles(data || []);
    } catch (err) {
      console.error('Error fetching profiles:', err);
    }
  };

  const fetchStockTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('*, product:products(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStockTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const getProfileName = (userId: string) => {
    const profile = profiles.find(p => p.id === userId || p.user_id === userId);
    return profile?.name || 'N/A';
  };

  const fetchSales = async () => {
    setSalesLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouse_sales')
        .select('*, items:warehouse_sale_items(*, product:products(*))')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setSalesLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [productsRes, stockRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('warehouse_stock').select('*, product:products(*)'),
      ]);

      setProducts((productsRes.data as Product[]) || []);
      setStock((stockRes.data as WarehouseStock[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: productForm.name,
          model: productForm.model,
          capacity: productForm.capacity || null,
          category: productForm.category,
        })
        .select()
        .single();

      if (productError) throw productError;

      const initialQty = parseInt(productForm.initialQuantity) || 0;
      const { error: stockError } = await supabase
        .from('warehouse_stock')
        .insert({
          product_id: product.id,
          quantity: initialQty,
        });

      if (stockError) throw stockError;

      toast({ title: 'Product added successfully' });
      setIsAddProductOpen(false);
      setProductForm({ name: '', model: '', capacity: '', category: 'Battery', initialQuantity: '' });
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error adding product', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;

    try {
      await supabase
        .from('warehouse_stock')
        .delete()
        .eq('product_id', productToDelete.id);

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id);

      if (error) throw error;

      toast({ title: 'Product deleted successfully' });
      setProductToDelete(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error deleting product', description: errorMessage, variant: 'destructive' });
    }
  };

  const addProductToTransfer = (productId: string) => {
    if (!productId) return;
    if (transferItems.some(item => item.productId === productId)) {
      toast({ title: 'Product already added', variant: 'destructive' });
      return;
    }
    setTransferItems([...transferItems, { productId, quantity: 1 }]);
    setTransferProductSearch('');
  };

  const removeProductFromTransfer = (productId: string) => {
    setTransferItems(transferItems.filter(item => item.productId !== productId));
  };

  const setTransferQuantity = (productId: string, quantity: number) => {
    setTransferItems(transferItems.map(item => {
      if (item.productId === productId) {
        // Allow 0 while typing, but enforce 1 as minimum for processing
        return { ...item, quantity: isNaN(quantity) ? 0 : Math.max(0, quantity) };
      }
      return item;
    }));
  };

  const updateTransferQuantity = (productId: string, delta: number) => {
    setTransferItems(transferItems.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  // Sale item management
  const addProductToSale = (productId: string) => {
    if (!productId) return;
    if (saleItems.some(item => item.productId === productId)) {
      toast({ title: 'Product already added', variant: 'destructive' });
      return;
    }
    const product = products.find(p => p.id === productId);
    setSaleItems([...saleItems, { productId, quantity: 1, price: 0 }]);
    setSaleProductSearch('');
  };

  const removeProductFromSale = (productId: string) => {
    setSaleItems(saleItems.filter(item => item.productId !== productId));
  };

  const setSaleQuantity = (productId: string, quantity: number) => {
    const stockItem = stock.find(s => s.product_id === productId);
    const available = stockItem?.quantity || 0;

    if (quantity > available) {
      toast({ title: 'Insufficient stock', description: `Only ${available} available`, variant: 'destructive' });
      quantity = available;
    }

    setSaleItems(saleItems.map(item => {
      if (item.productId === productId) {
        // Allow 0 while typing
        return { ...item, quantity: isNaN(quantity) ? 0 : Math.max(0, quantity) };
      }
      return item;
    }));
  };

  const setSalePrice = (productId: string, price: number) => {
    setSaleItems(saleItems.map(item => {
      if (item.productId === productId) {
        return { ...item, price: Math.max(0, price) };
      }
      return item;
    }));
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || saleItems.length === 0 || !saleForm.customer_name) {
      toast({ title: 'Please fill all fields and add at least one product', variant: 'destructive' });
      return;
    }

    try {
      const totalAmount = saleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      const { data: sale, error: saleError } = await supabase
        .from('warehouse_sales')
        .insert({
          customer_name: saleForm.customer_name,
          payment_method: saleForm.payment_method,
          sold_by: user.id,
          total_amount: totalAmount,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItemRecords = saleItems.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          sale_id: sale.id,
          product_id: item.productId,
          model_number: product?.model || 'N/A',
          product_type: product?.category || 'Battery',
          quantity: item.quantity,
          price: item.price,
        };
      });

      const { error: itemsError } = await supabase
        .from('warehouse_sale_items')
        .insert(saleItemRecords);

      if (itemsError) throw itemsError;

      // Update stock quantities
      for (const item of saleItems) {
        const currentStock = stock.find(s => s.product_id === item.productId);
        if (currentStock) {
          const newQty = Math.max(0, currentStock.quantity - item.quantity);
          await supabase
            .from('warehouse_stock')
            .update({ quantity: newQty })
            .eq('id', currentStock.id);

          // Also record as a stock transaction for full history
          await supabase.from('stock_transactions').insert({
            product_id: item.productId,
            quantity: item.quantity,
            transaction_type: 'OUT',
            source: 'WAREHOUSE',
            remarks: `Sale to ${saleForm.customer_name}`,
            handled_by: user.id
          });
        }
      }

      toast({ title: 'Sale recorded successfully', description: `Recorded sale for ${saleForm.customer_name}` });
      setIsRecordSaleOpen(false);
      setSaleForm({ customer_name: '', payment_method: 'CASH' });
      setSaleItems([]);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error recording sale', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleStockTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || transferItems.length === 0 || !transferForm.transaction_type || !transferForm.source) {
      toast({ title: 'Please fill all fields and add at least one product', variant: 'destructive' });
      return;
    }

    try {
      for (const item of transferItems) {
        const { error: transError } = await supabase.from('stock_transactions').insert({
          product_id: item.productId,
          quantity: item.quantity,
          transaction_type: transferForm.transaction_type,
          source: transferForm.source,
          handled_by: user.id,
          remarks: transferForm.remarks || null,
        });

        if (transError) throw transError;

        const currentStock = stock.find(s => s.product_id === item.productId);
        const currentQty = currentStock?.quantity || 0;
        const newQty = transferForm.transaction_type === 'IN'
          ? currentQty + item.quantity
          : Math.max(0, currentQty - item.quantity);

        if (currentStock) {
          const { error: updateError } = await supabase
            .from('warehouse_stock')
            .update({ quantity: newQty })
            .eq('id', currentStock.id);

          if (updateError) throw updateError;
        }
      }

      toast({
        title: 'Stock transfer completed',
        description: `Processed ${transferItems.length} items successfully`
      });
      setIsStockTransferOpen(false);
      setTransferForm({ transaction_type: 'IN', source: 'WAREHOUSE', remarks: '' });
      setTransferItems([]);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error processing transfer', description: errorMessage, variant: 'destructive' });
    }
  };

  const filteredStock = stock.filter(item => {
    const searchLower = search.toLowerCase();
    const productName = item.product?.name?.toLowerCase() || '';
    const productModel = item.product?.model?.toLowerCase() || '';
    const combined = `${productName} ${productModel}`;
    const matchesSearch = productName.includes(searchLower) ||
      productModel.includes(searchLower) ||
      combined.includes(searchLower);

    if (!matchesSearch) return false;

    if (stockFilter === 'low') return item.quantity < 5;
    if (stockFilter === 'medium') return item.quantity >= 5 && item.quantity < 20;
    if (stockFilter === 'high') return item.quantity >= 20;

    return true;
  });

  const filterByCategory = (category: string) =>
    filteredStock.filter(item => (item.product as any)?.category === category);

  const renderStockTable = (items: WarehouseStock[]) => (
    <div className="w-full bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
      {/* Grid Header */}
      <div className="hidden lg:grid grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_auto] gap-4 p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#0B0F19]/80 sticky top-0 z-10 text-[11px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider backdrop-blur-md">
        <div>Product</div>
        <div>Model</div>
        <div>Capacity</div>
        <div className="text-right">Quantity</div>
        <div>Health Status</div>
        {canDeleteProducts ? <div className="w-8"></div> : <div className="w-0"></div>}
      </div>

      {/* Grid Body */}
      <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[650px] smooth-scroll-list styled-scrollbar pb-8">
        {items.length === 0 ? (
          <div className="p-12 text-center text-slate-600 dark:text-slate-500 font-medium flex flex-col items-center justify-center gap-3">
            <Package className="h-10 w-10 text-slate-700" />
            No products found in this category
          </div>
        ) : (
          items.map((item, i) => {
            const health = item.quantity < 5 ? 'critical' : item.quantity < 20 ? 'warning' : 'good';
            const healthColor = health === 'critical' ? 'bg-red-500' : health === 'warning' ? 'bg-amber-400' : 'bg-[#4F8CFF]';
            const healthGlow = health === 'critical' ? 'shadow-[0_0_12px_rgba(239,68,68,0.5)]' : health === 'warning' ? 'shadow-[0_0_10px_rgba(251,191,36,0.3)]' : 'shadow-[0_0_10px_rgba(79,140,255,0.3)]';

            return (
              <div key={item.id} className="stock-row group relative flex flex-col lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 lg:gap-4 p-4 lg:items-center hover:bg-slate-50 dark:hover:bg-[#1B2438]/60 transition-colors duration-150">
                {/* Row selected indicator line */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4F8CFF] scale-y-0 lg:group-hover:scale-y-100 transition-transform origin-center" />

                {/* Mobile top row: Title and Qty */}
                <div className="flex justify-between items-center w-full lg:hidden mb-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 truncate pr-4 text-[16px]">{item.product?.name}</div>
                  <div className="text-right font-bold text-[18px] text-slate-900 dark:text-white tabular-nums drop-shadow-sm">{item.quantity} units</div>
                </div>

                <div className="hidden lg:block font-bold text-slate-800 dark:text-slate-200 truncate pr-4 text-[14px]">{item.product?.name}</div>
                <div className="text-slate-600 dark:text-slate-500 dark:text-slate-400 text-[13px] truncate flex items-center gap-2"><span className="lg:hidden uppercase text-[10px] font-bold opacity-60">Model</span>{item.product?.model}</div>
                <div className="text-slate-600 dark:text-slate-500 text-[13px] flex items-center gap-2"><span className="lg:hidden uppercase text-[10px] font-bold opacity-60">Capacity</span>{item.product?.capacity || '-'}</div>

                <div className="hidden lg:block text-right font-bold text-lg text-slate-900 dark:text-white tabular-nums drop-shadow-sm">
                  {item.quantity}
                </div>

                <div className="flex flex-col gap-2 relative lg:pl-2 mt-2 lg:mt-0">
                  <div className="flex items-center gap-2">
                    {health === 'critical' ? (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 border border-red-500/20 ${healthGlow} animate-pulse shadow-red-500/20`}>
                        <AlertTriangle className="h-3 w-3" /> Critical Low
                      </span>
                    ) : health === 'warning' ? (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 ${healthGlow}`}>
                        <ArrowDownCircle className="h-3 w-3" /> Reorder Soon
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-[#4F8CFF] bg-[#4F8CFF]/10 border border-[#4F8CFF]/20 ${healthGlow}`}>
                        <ArrowUpCircle className="h-3 w-3" /> Healthy Stock
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full max-w-[120px] bg-slate-50 dark:bg-[#0B0F19] rounded-full overflow-hidden shadow-inner hidden sm:block border border-slate-200 dark:border-white/5">
                    <div
                      className={`h-full rounded-full ${healthColor} transition-all duration-1000 ease-out`}
                      style={{ width: `${Math.min(100, (item.quantity / 50) * 100)}%` }}
                    />
                  </div>
                </div>

                {canDeleteProducts ? (
                  <div className="w-8 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-slate-600 dark:text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      onClick={() => item.product && setProductToDelete(item.product as Product)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : <div className="w-0"></div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const handleExportAll = () => {
    const data = filteredStock.map(item => formatStockForExport(item));
    downloadCSV(data, `inventory-${new Date().toISOString().split('T')[0]}`);
  };

  const handleDownloadTemplate = () => {
    // Include existing products + empty rows for new products
    const templateData = stock.map(item => ({
      'Product ID': item.product_id,
      'Product Name': item.product?.name || '',
      'Model': item.product?.model || '',
      'Category': item.product?.category || '',
      'Capacity': item.product?.capacity || '',
      'Current Quantity': item.quantity,
      'New Quantity': item.quantity,
    }));
    // Add 5 blank rows for new products
    for (let i = 0; i < 5; i++) {
      templateData.push({
        'Product ID': '' as any,
        'Product Name': '',
        'Model': '',
        'Category': '',
        'Capacity': '',
        'Current Quantity': '' as any,
        'New Quantity': '' as any,
      });
    }
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory-template-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Template downloaded', description: 'Edit quantities for existing products OR fill Name/Model/Category to add new ones (leave Product ID blank for new)' });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      let updated = 0;
      let created = 0;

      for (const row of rows) {
        const productId = row['Product ID']?.toString().trim();
        const newQty = parseInt(row['New Quantity']);
        const productName = row['Product Name']?.toString().trim();
        const model = row['Model']?.toString().trim();
        const category = row['Category']?.toString().trim();
        const capacity = row['Capacity']?.toString().trim() || null;

        // Mode 1: Update existing product stock
        if (productId && !isNaN(newQty) && newQty >= 0) {
          const { error } = await supabase
            .from('warehouse_stock')
            .update({ quantity: newQty })
            .eq('product_id', productId);
          if (!error) updated++;
          continue;
        }

        // Mode 2: Create new product if Name, Model, Category are filled
        if (!productId && productName && model && category) {
          const qty = !isNaN(newQty) && newQty >= 0 ? newQty : 0;
          const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert({ name: productName, model, category: category || 'Battery', capacity })
            .select()
            .single();

          if (productError) {
            console.error('Error creating product:', productError);
            continue;
          }

          const { error: stockError } = await supabase
            .from('warehouse_stock')
            .insert({ product_id: newProduct.id, quantity: qty });

          if (!stockError) created++;
        }
      }

      const parts = [];
      if (updated > 0) parts.push(`Updated ${updated} items`);
      if (created > 0) parts.push(`Created ${created} new products`);
      toast({ title: 'Bulk import complete', description: parts.join('. ') || 'No changes made' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error processing file', description: msg, variant: 'destructive' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const canManageProducts = hasAnyRole(['admin', 'procurement_staff']);
  const canManageStock = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff']);
  const canDeleteProducts = hasRole('admin');

  const getTransactionOptions = () => {
    // Only Stock In for destination warehouse
    return {
      types: [{ value: 'IN', label: 'Stock In' }],
      sources: [
        { value: 'SUPPLIER', label: 'Supplier (OEM)' },
        { value: 'WAREHOUSE', label: 'Warehouse' }
      ]
    };
  };

  const transactionOptions = getTransactionOptions();

  // Filtered products for transfer/sale search
  const filteredTransferProducts = products.filter(p =>
    !transferItems.some(item => item.productId === p.id) &&
    (p.name.toLowerCase().includes(transferProductSearch.toLowerCase()) ||
      p.model.toLowerCase().includes(transferProductSearch.toLowerCase()))
  );

  const filteredSaleProducts = products.filter(p => {
    const stockItem = stock.find(s => s.product_id === p.id);
    return !saleItems.some(item => item.productId === p.id) &&
      (stockItem?.quantity || 0) > 0 &&
      (p.name.toLowerCase().includes(saleProductSearch.toLowerCase()) ||
        p.model.toLowerCase().includes(saleProductSearch.toLowerCase()));
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
              <div className="flex items-center bg-muted/50 p-1 rounded-lg border">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'inventory'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Current Stock
                </button>
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${activeTab === 'sales'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  History
                </button>
              </div>
            </div>
            <p className="text-muted-foreground">
              {activeTab === 'inventory' ? 'Manage warehouse stock and products' : 'View history of sales and stock movements'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="outline" onClick={handleExportAll} disabled={filteredStock.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Template
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleBulkUpload}
                  className="hidden"
                />
              </>
            )}
            {canManageProducts && (
              <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Product</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddProduct} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="product-name">Product Name</Label>
                      <Input
                        id="product-name"
                        value={productForm.name}
                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Battery">Battery</SelectItem>
                          <SelectItem value="Inverter">Inverter</SelectItem>
                          <SelectItem value="UPS">UPS</SelectItem>
                          <SelectItem value="Trolly">Trolly</SelectItem>
                          <SelectItem value="Solar Panel">Solar Panel</SelectItem>
                          <SelectItem value="Charger">Charger</SelectItem>
                          <SelectItem value="SMF">SMF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="product-model">Model</Label>
                        <Input
                          id="product-model"
                          value={productForm.model}
                          onChange={(e) => setProductForm({ ...productForm, model: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-capacity">Capacity</Label>
                        <Input
                          id="product-capacity"
                          value={productForm.capacity}
                          onChange={(e) => setProductForm({ ...productForm, capacity: e.target.value })}
                          placeholder="e.g., 12V 100Ah"
                        />
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="space-y-2">
                        <Label htmlFor="product-quantity">Initial Warehouse Quantity (Optional)</Label>
                        <Input
                          id="product-quantity"
                          type="number"
                          min="0"
                          value={productForm.initialQuantity}
                          onChange={(e) => setProductForm({ ...productForm, initialQuantity: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                    )}
                    <Button type="submit" className="w-full">Add Product</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {canManageStock && (
              <Dialog open={isRecordSaleOpen} onOpenChange={setIsRecordSaleOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:scale-[1.02] hover:shadow-[0_8px_32px_rgba(16,185,129,0.35)] text-white shadow-lg border-0 transition-all duration-300 font-bold tracking-wide">
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Record Sale
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Record Warehouse Sale</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleRecordSale} className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="customer_name">Customer Name</Label>
                        <Input
                          id="customer_name"
                          placeholder="Enter customer name"
                          value={saleForm.customer_name}
                          onChange={(e) => setSaleForm({ ...saleForm, customer_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment_method">Payment Method</Label>
                        <Select
                          value={saleForm.payment_method}
                          onValueChange={(value) => setSaleForm({ ...saleForm, payment_method: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="CARD">Card</SelectItem>
                            <SelectItem value="UPI">UPI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2 border-t pt-4">
                      <Label>Add Products to Sale</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search products to sell..."
                            value={saleProductSearch}
                            onChange={(e) => setSaleProductSearch(e.target.value)}
                            className="pl-8"
                          />
                          {saleProductSearch && filteredSaleProducts.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {filteredSaleProducts.map(product => (
                                <button
                                  key={product.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between items-center"
                                  onClick={() => addProductToSale(product.id)}
                                >
                                  <div>
                                    <p className="font-medium text-sm">{product.name}</p>
                                    <p className="text-xs text-muted-foreground">{product.model}</p>
                                  </div>
                                  <Badge variant="outline">
                                    {stock.find(s => s.product_id === product.id)?.quantity || 0} in stock
                                  </Badge>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Sale Items</Label>
                      {saleItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
                          No items added to sale yet
                        </p>
                      ) : (
                        <div className="border rounded-md divide-y">
                          {saleItems.map((item, index) => {
                            const product = products.find(p => p.id === item.productId);
                            const stockItem = stock.find(s => s.product_id === item.productId);
                            const max = stockItem?.quantity || 0;

                            return (
                              <div key={item.productId} className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex-1 w-full sm:w-auto overflow-hidden">
                                  <p className="font-medium text-sm truncate">{product?.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{product?.model}</p>
                                </div>
                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full sm:w-auto">
                                  <div className="flex flex-col items-start sm:items-end gap-1 flex-1 sm:flex-none">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Price</Label>
                                    <Input
                                      type="number"
                                      className="w-24 h-8 text-right"
                                      value={item.price}
                                      onChange={(e) => setSalePrice(item.productId, parseFloat(e.target.value))}
                                    />
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Qty (Max: {max})</Label>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setSaleQuantity(item.productId, item.quantity - 1)}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        type="number"
                                        className="h-7 w-12 text-center p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={item.quantity === 0 ? '' : item.quantity}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setSaleQuantity(item.productId, val === '' ? 0 : parseInt(val));
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setSaleQuantity(item.productId, item.quantity + 1)}
                                        disabled={item.quantity >= max}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => removeProductFromSale(item.productId)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          <div className="p-3 bg-muted/30 flex justify-between items-center font-bold">
                            <span>Total Amount</span>
                            <span className="text-chart-3">
                              ₹{saleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button type="submit" className="w-full" disabled={saleItems.length === 0}>
                      Confirm and Record Sale
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {canManageStock && transactionOptions.types.length > 0 && (

              <Dialog open={isStockTransferOpen} onOpenChange={(open) => {
                setIsStockTransferOpen(open);
                if (!open) setTransferProductSearch('');
              }}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-[1.02] hover:shadow-[0_8px_32px_rgba(59,130,246,0.35)] text-white shadow-lg border-0 transition-all duration-300 font-bold tracking-wide">
                    <Package className="h-4 w-4 mr-2 text-blue-200" />
                    Stock Transfer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Inventory Stock In
                      <span className="text-sm font-normal text-muted-foreground block">
                        Add stock to Warehouse inventory
                      </span>
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleStockTransfer} className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                        <p className="font-medium text-sm">STOCK IN</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Destination</Label>
                        <Select
                          value={transferForm.source}
                          onValueChange={(value) => setTransferForm({ ...transferForm, source: value as StockSource })}
                        >
                          <SelectTrigger className="h-8 text-xs border-none bg-transparent p-0 shadow-none">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {transactionOptions.sources.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Add Products</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search products to add..."
                          value={transferProductSearch}
                          onChange={(e) => setTransferProductSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      {transferProductSearch && filteredTransferProducts.length > 0 && (
                        <div className="max-h-[150px] overflow-y-auto border rounded-md">
                          {filteredTransferProducts.map(product => (
                            <button
                              key={product.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center"
                              onClick={() => addProductToTransfer(product.id)}
                            >
                              <span>{product.name} - {product.model}</span>
                              <Badge variant="outline" className="text-xs">{(product as any).category}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      {transferProductSearch && filteredTransferProducts.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">No matching products</p>
                      )}
                    </div>

                    {transferItems.length > 0 && (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-md p-2">
                        {transferItems.map((item) => {
                          const product = products.find(p => p.id === item.productId);
                          return (
                            <div key={item.productId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 bg-muted/50 rounded-md gap-3">
                              <div className="flex-1 overflow-hidden">
                                <p className="font-medium text-sm truncate">{product?.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{product?.model}</p>
                              </div>
                              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                <div className="flex items-center">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => updateTransferQuantity(item.productId, -1)}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <Input
                                    type="number"
                                    value={item.quantity === 0 ? '' : item.quantity}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTransferQuantity(item.productId, val === '' ? 0 : parseInt(val));
                                    }}
                                    className="w-20 text-center h-8 mx-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => updateTransferQuantity(item.productId, 1)}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => removeProductFromTransfer(item.productId)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="remarks">Remarks (Optional)</Label>
                      <Textarea
                        id="remarks"
                        value={transferForm.remarks}
                        onChange={(e) => setTransferForm({ ...transferForm, remarks: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full">Process Transfer</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={activeTab === 'inventory' ? "Search products..." : "Search by customer or product..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {activeTab === 'inventory' && (
            <Select value={stockFilter} onValueChange={(v: any) => setStockFilter(v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Stock Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="low">Low Stock (&lt; 5)</SelectItem>
                <SelectItem value="medium">Medium (5-19)</SelectItem>
                <SelectItem value="high">High Stock (20+)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {activeTab === 'inventory' ? (
          loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Loading inventory...</div>
            </div>
          ) : (
            <Tabs defaultValue="all">
              <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
                <TabsTrigger value="all" className="rounded-full border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  All ({filteredStock.length})
                </TabsTrigger>
                {['Battery', 'Inverter', 'UPS', 'Trolly', 'Solar Panel', 'Charger', 'SMF'].map(cat => {
                  const count = filterByCategory(cat).length;
                  return (
                    <TabsTrigger key={cat} value={cat} className="rounded-full border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      {cat}s ({count})
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <div className="mt-6 glass-card rounded-2xl overflow-hidden border shadow-sm">
                <TabsContent value="all" className="m-0">
                  <div className="p-4 bg-muted/30 border-b">
                    <h2 className="font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      All Stock
                    </h2>
                  </div>
                  {renderStockTable(filteredStock)}
                </TabsContent>

                {['Battery', 'Inverter', 'UPS', 'Trolly', 'Solar Panel', 'Charger', 'SMF'].map(cat => (
                  <TabsContent key={cat} value={cat} className="m-0">
                    <div className="p-4 bg-muted/30 border-b">
                      <h2 className="font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        {cat} Stock
                      </h2>
                    </div>
                    {renderStockTable(filterByCategory(cat))}
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          )
        ) : (
          <div className="space-y-4">
            <Card className="rounded-2xl overflow-hidden border shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Inventory Activity History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {salesLoading || transactionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-pulse text-muted-foreground">Loading history...</div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Activity Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Handled By</TableHead>
                        <TableHead>Info / Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const sLower = search.toLowerCase();

                        // Transform sales to activity records
                        const salesActivity = sales.map(s => ({
                          id: `sale-${s.id}`,
                          date: s.created_at,
                          type: 'SALE',
                          details: s.customer_name || 'Walking Customer',
                          items: s.items || [],
                          quantity: s.items?.reduce((acc: number, cur: any) => acc + (cur.quantity || 0), 0) || 0,
                          handler: s.sold_by,
                          info: `${s.payment_method} - ₹${s.total_amount?.toLocaleString()}`,
                        }));

                        // Transform transactions to activity records (ONLY 'IN' transactions as per user request)
                        const transActivity = stockTransactions
                          .filter(t => t.transaction_type === 'IN')
                          .map(t => ({
                            id: `trans-${t.id}`,
                            date: t.created_at,
                            type: 'STOCK IN',
                            details: `Stock Added: ${t.product?.name}`,
                            items: [],
                            quantity: t.quantity,
                            handler: t.handled_by,
                            info: `${t.product?.model} - ${t.remarks || 'Stock Transfer'}`,
                          }));

                        const unified = [...salesActivity, ...transActivity].sort((a, b) =>
                          new Date(b.date).getTime() - new Date(a.date).getTime()
                        ).filter(a => {
                          const matchesSearch =
                            a.details?.toLowerCase().includes(sLower) ||
                            a.info?.toLowerCase().includes(sLower) ||
                            a.items?.some((i: any) => {
                              const pName = i.product?.name?.toLowerCase() || '';
                              const pModel = i.model_number?.toLowerCase() || '';
                              return pName.includes(sLower) || pModel.includes(sLower);
                            });
                          return matchesSearch;
                        });

                        if (unified.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                                No activity records found
                              </TableCell>
                            </TableRow>
                          );
                        }

                        return unified.map((act) => (
                          <TableRow key={act.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(act.date).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </TableCell>
                            <TableCell>
                              {act.type === 'SALE' ? (
                                <Badge variant="default" className="bg-emerald-600">SALE</Badge>
                              ) : (
                                <Badge variant="outline" className="text-blue-500 border-blue-500/20 bg-blue-500/10">STOCK IN</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{act.details}</div>
                              {act.items.length > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-1">
                                  {act.items.map((i: any, idx: number) => (
                                    <span key={idx}>
                                      {i.quantity}x {i.product?.name || i.model_number}
                                      {idx < act.items.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {act.type === 'SALE' ? '-' : '+'}{act.quantity}
                            </TableCell>
                            <TableCell className="text-sm">
                              {getProfileName(act.handler)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {act.info}
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{productToDelete?.name} - {productToDelete?.model}" and its stock record.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
