import { useEffect, useState, useRef } from 'react';
import { Plus, Minus, Search, Package, ArrowUpCircle, ArrowDownCircle, Download, Trash2, X, Upload } from 'lucide-react';
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
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transferProductSearch, setTransferProductSearch] = useState('');

  // Product form
  const [productForm, setProductForm] = useState({
    name: '',
    model: '',
    capacity: '',
    category: 'Battery',
    initialQuantity: '',
  });

  // Stock transfer form
  const [transferForm, setTransferForm] = useState({
    transaction_type: 'IN' as TransactionType | '',
    source: 'WAREHOUSE' as StockSource | '',
    remarks: '',
  });

  const [transferItems, setTransferItems] = useState<{ productId: string; quantity: number }[]>([]);

  // Role-based restrictions
  const isWarehouseStaff = hasRole('warehouse_staff');
  const isProcurementStaff = hasRole('procurement_staff');
  const isAdmin = hasRole('admin');

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

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
        return { ...item, quantity: Math.max(1, quantity) };
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
      setTransferForm({ transaction_type: 'IN', source: '', remarks: '' });
      setTransferItems([]);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error processing transfer', description: errorMessage, variant: 'destructive' });
    }
  };

  const filteredStock = stock.filter(item => {
    const matchesSearch = item.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.product?.model?.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    if (stockFilter === 'low') return item.quantity < 5;
    if (stockFilter === 'medium') return item.quantity >= 5 && item.quantity < 20;
    if (stockFilter === 'high') return item.quantity >= 20;
    
    return true;
  });

  const filterByCategory = (category: string) =>
    filteredStock.filter(item => (item.product as any)?.category === category);

  const renderStockTable = (items: WarehouseStock[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead>Status</TableHead>
          {canDeleteProducts && <TableHead className="w-[50px]"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={canDeleteProducts ? 6 : 5} className="text-center text-muted-foreground py-8">
              No products in this category
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.product?.name}</TableCell>
              <TableCell>{item.product?.model}</TableCell>
              <TableCell>{item.product?.capacity || '-'}</TableCell>
              <TableCell className="text-right font-medium">{item.quantity}</TableCell>
              <TableCell>
                {item.quantity < 5 ? (
                  <Badge variant="destructive" className="gap-1">
                    <ArrowDownCircle className="h-3 w-3" />
                    Low Stock
                  </Badge>
                ) : item.quantity < 20 ? (
                  <Badge variant="secondary" className="gap-1">
                    Medium
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 bg-chart-4/20 text-chart-4 border-chart-4/30">
                    <ArrowUpCircle className="h-3 w-3" />
                    In Stock
                  </Badge>
                )}
              </TableCell>
              {canDeleteProducts && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => item.product && setProductToDelete(item.product)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
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
      'Category': (item.product as any)?.category || '',
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
            .insert({ name: productName, model, category, capacity })
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
    if (isAdmin) {
      return {
        types: [{ value: 'IN', label: 'Stock In' }, { value: 'OUT', label: 'Stock Out' }],
        sources: [
          { value: 'SUPPLIER', label: 'Supplier (OEM)' },
          { value: 'WAREHOUSE', label: 'Warehouse' },
          { value: 'SHOP', label: 'Shop' }
        ]
      };
    }
    if (isWarehouseStaff) {
      return {
        types: [{ value: 'OUT', label: 'Stock Out' }],
        sources: [{ value: 'SHOP', label: 'Shop' }]
      };
    }
    if (isProcurementStaff) {
      return {
        types: [{ value: 'IN', label: 'Stock In' }],
        sources: [{ value: 'SUPPLIER', label: 'Supplier (OEM)' }]
      };
    }
    return { types: [], sources: [] };
  };

  const transactionOptions = getTransactionOptions();

  // Filtered products for transfer search
  const filteredTransferProducts = products.filter(p =>
    !transferItems.some(item => item.productId === p.id) &&
    (p.name.toLowerCase().includes(transferProductSearch.toLowerCase()) ||
     p.model.toLowerCase().includes(transferProductSearch.toLowerCase()))
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
            <p className="text-muted-foreground">Manage warehouse stock and products</p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
            {canManageStock && transactionOptions.types.length > 0 && (
              <Dialog open={isStockTransferOpen} onOpenChange={(open) => {
                setIsStockTransferOpen(open);
                if (!open) setTransferProductSearch('');
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Package className="h-4 w-4 mr-2" />
                    Stock Transfer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Stock Transfer
                      {isWarehouseStaff && !isAdmin && (
                        <span className="text-sm font-normal text-muted-foreground block">
                          Warehouse → Shop (Stock Out only)
                        </span>
                      )}
                      {isProcurementStaff && !isAdmin && (
                        <span className="text-sm font-normal text-muted-foreground block">
                          Supplier/OEM → Warehouse (Stock In only)
                        </span>
                      )}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleStockTransfer} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Transaction Type</Label>
                        <Select 
                          value={transferForm.transaction_type} 
                          onValueChange={(value) => {
                            const newSource = value === 'IN' ? 'WAREHOUSE' : value === 'OUT' ? 'SHOP' : transferForm.source;
                            setTransferForm({ ...transferForm, transaction_type: value as TransactionType, source: newSource as StockSource | '' });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {transactionOptions.types.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Destination/Source</Label>
                        <Select 
                          value={transferForm.source} 
                          onValueChange={(value) => setTransferForm({ ...transferForm, source: value as StockSource })}
                        >
                          <SelectTrigger>
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
                            <div key={item.productId} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                              <div className="flex-1">
                                <p className="font-medium text-sm">{product?.name}</p>
                                <p className="text-xs text-muted-foreground">{product?.model}</p>
                              </div>
                              <div className="flex items-center gap-3">
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
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => setTransferQuantity(item.productId, parseInt(e.target.value) || 1)}
                                  className="w-20 text-center h-8 mx-1"
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
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading inventory...</div>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({filteredStock.length})</TabsTrigger>
              <TabsTrigger value="Battery">Batteries ({filterByCategory('Battery').length})</TabsTrigger>
              <TabsTrigger value="Inverter">Inverters ({filterByCategory('Inverter').length})</TabsTrigger>
              <TabsTrigger value="UPS">UPS ({filterByCategory('UPS').length})</TabsTrigger>
              <TabsTrigger value="Trolly">Trollys ({filterByCategory('Trolly').length})</TabsTrigger>
              <TabsTrigger value="Solar Panel">Solar Panels ({filterByCategory('Solar Panel').length})</TabsTrigger>
              <TabsTrigger value="Charger">Chargers ({filterByCategory('Charger').length})</TabsTrigger>
              <TabsTrigger value="SMF">SMF ({filterByCategory('SMF').length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <Card><CardHeader><CardTitle>All Stock</CardTitle></CardHeader><CardContent>{renderStockTable(filteredStock)}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Battery">
              <Card><CardHeader><CardTitle>Batteries</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('Battery'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Inverter">
              <Card><CardHeader><CardTitle>Inverters</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('Inverter'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="UPS">
              <Card><CardHeader><CardTitle>UPS</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('UPS'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Trolly">
              <Card><CardHeader><CardTitle>Trollys</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('Trolly'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Solar Panel">
              <Card><CardHeader><CardTitle>Solar Panels</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('Solar Panel'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Charger">
              <Card><CardHeader><CardTitle>Chargers</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('Charger'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="SMF">
              <Card><CardHeader><CardTitle>SMF</CardTitle></CardHeader><CardContent>{renderStockTable(filterByCategory('SMF'))}</CardContent></Card>
            </TabsContent>
          </Tabs>
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
