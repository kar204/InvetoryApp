import { useEffect, useState } from 'react';
import { Search, ShoppingCart, Package, Plus, Minus, X, History } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ShopStockItem {
  id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  product?: {
    id: string;
    name: string;
    model: string;
    capacity: string | null;
    category: string;
  };
}

interface SaleCartItem {
  product_id: string;
  product_name: string;
  product_model: string;
  product_type: string;
  price: string;
  quantity: number;
  max_qty: number;
}

interface SaleRecord {
  id: string;
  customer_name: string;
  sold_by: string;
  created_at: string;
  items?: SaleItemRecord[];
}

interface SaleItemRecord {
  id: string;
  product_type: string;
  model_number: string;
  price: number | null;
  quantity: number;
  product_id: string | null;
}

export default function Shop() {
  const { user, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [shopStock, setShopStock] = useState<ShopStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [isSaleOpen, setIsSaleOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [saleRemarks, setSaleRemarks] = useState('');
  const [saleProductSearch, setSaleProductSearch] = useState('');
  const [saleCart, setSaleCart] = useState<SaleCartItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);

  const canRecordSale = hasAnyRole(['admin', 'counter_staff', 'seller']);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('shop-stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_stock' }, () => fetchData())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, []);

  const fetchData = async () => {
    try {
      const [stockRes, salesRes] = await Promise.all([
        supabase.from('shop_stock').select('*, product:products(id, name, model, capacity, category)'),
        supabase.from('shop_sales').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      const stockData = (stockRes.data as ShopStockItem[]) || [];
      setShopStock(stockData);

      const sales = (salesRes.data as SaleRecord[]) || [];
      if (sales.length > 0) {
        const saleIds = sales.map(s => s.id);
        const { data: itemsData } = await supabase
          .from('shop_sale_items')
          .select('*')
          .in('sale_id', saleIds);

        const itemsBySale: Record<string, SaleItemRecord[]> = {};
        (itemsData || []).forEach((item: any) => {
          if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
          itemsBySale[item.sale_id].push(item);
        });

        sales.forEach(sale => {
          sale.items = itemsBySale[sale.id] || [];
        });
      }
      setSalesHistory(sales);
    } catch (error) {
      console.error('Error fetching shop data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (stockItem: ShopStockItem) => {
    if (saleCart.some(c => c.product_id === stockItem.product_id)) {
      toast({ title: 'Product already added', variant: 'destructive' });
      return;
    }
    setSaleCart([...saleCart, {
      product_id: stockItem.product_id,
      product_name: stockItem.product?.name || '',
      product_model: stockItem.product?.model || '',
      product_type: stockItem.product?.category || 'Battery',
      price: '',
      quantity: 1,
      max_qty: stockItem.quantity,
    }]);
    setSaleProductSearch('');
  };

  const removeFromCart = (productId: string) => {
    setSaleCart(saleCart.filter(c => c.product_id !== productId));
  };

  const updateCartItem = (productId: string, field: 'price' | 'quantity', value: string | number) => {
    setSaleCart(saleCart.map(c => {
      if (c.product_id !== productId) return c;
      if (field === 'quantity') {
        return { ...c, quantity: Math.max(1, Math.min(c.max_qty, value as number)) };
      }
      return { ...c, [field]: String(value) };
    }));
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !customerName.trim()) {
      toast({ title: 'Customer name is required', variant: 'destructive' });
      return;
    }
    if (saleCart.length === 0) {
      toast({ title: 'Add at least one product', variant: 'destructive' });
      return;
    }

    try {
      const { data: sale, error: saleError } = await supabase
        .from('shop_sales')
        .insert({ customer_name: customerName.trim(), sold_by: user.id })
        .select()
        .single();
      if (saleError) throw saleError;

      for (const item of saleCart) {
        const modelNumber = `${item.product_name} - ${item.product_model}`;

        const { error: itemError } = await supabase.from('shop_sale_items').insert({
          sale_id: sale.id,
          product_type: item.product_type,
          model_number: modelNumber,
          price: item.price ? parseFloat(item.price) : null,
          product_id: item.product_id,
          quantity: item.quantity,
        });
        if (itemError) throw itemError;

        const stockItem = shopStock.find(s => s.product_id === item.product_id);
        if (stockItem) {
          await supabase.from('shop_stock')
            .update({ quantity: Math.max(0, stockItem.quantity - item.quantity) })
            .eq('product_id', item.product_id);
        }
      }

      toast({ title: 'Sale recorded successfully' });
      setIsSaleOpen(false);
      setCustomerName('');
      setSaleRemarks('');
      setSaleCart([]);
      setSaleProductSearch('');
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error recording sale', description: msg, variant: 'destructive' });
    }
  };

  const totalStock = shopStock.reduce((sum, s) => sum + s.quantity, 0);

  const filterByCategory = (category: string) =>
    shopStock.filter(item => {
      const matchesCategory = item.product?.category === category;
      const matchesSearch = item.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
        item.product?.model?.toLowerCase().includes(search.toLowerCase());
      
      if (!matchesCategory || !matchesSearch) return false;

      if (stockFilter === 'low') return item.quantity < 5;
      if (stockFilter === 'medium') return item.quantity >= 5 && item.quantity < 20;
      if (stockFilter === 'high') return item.quantity >= 20;
      
      return true;
    });

  const filteredSaleProducts = shopStock.filter(s =>
    s.quantity > 0 &&
    !saleCart.some(c => c.product_id === s.product_id) &&
    (s.product?.name?.toLowerCase().includes(saleProductSearch.toLowerCase()) ||
     s.product?.model?.toLowerCase().includes(saleProductSearch.toLowerCase()))
  );

  const renderStockTable = (items: ShopStockItem[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No stock available</TableCell>
          </TableRow>
        ) : items.map(item => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.product?.name}</TableCell>
            <TableCell>{item.product?.model}</TableCell>
            <TableCell>{item.product?.capacity || '-'}</TableCell>
            <TableCell className="text-right font-medium">{item.quantity}</TableCell>
            <TableCell>
              {item.quantity === 0 ? (
                <Badge variant="destructive">Out of Stock</Badge>
              ) : item.quantity < 5 ? (
                <Badge variant="destructive">Low Stock</Badge>
              ) : (
                <Badge variant="outline" className="bg-chart-4/20 text-chart-4 border-chart-4/30">In Stock</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
            <p className="text-muted-foreground">Manage shop stock and record sales</p>
          </div>
          {canRecordSale && (
            <Dialog open={isSaleOpen} onOpenChange={(open) => {
              setIsSaleOpen(open);
              if (!open) { setSaleProductSearch(''); setSaleCart([]); setSaleRemarks(''); setCustomerName(''); }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Record Sale
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Sale</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleRecordSale} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                  </div>

                  {/* Searchable product picker */}
                  <div className="space-y-2">
                    <Label>Add Products</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search products to add..."
                        value={saleProductSearch}
                        onChange={e => setSaleProductSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {saleProductSearch && filteredSaleProducts.length > 0 && (
                      <div className="max-h-[150px] overflow-y-auto border rounded-md">
                        {filteredSaleProducts.map(s => (
                          <button
                            key={s.product_id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center"
                            onClick={() => addToCart(s)}
                          >
                            <span>{s.product?.name} - {s.product?.model}</span>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{s.product?.category}</Badge>
                              <span className="text-xs text-muted-foreground">Qty: {s.quantity}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {saleProductSearch && filteredSaleProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">No matching products in stock</p>
                    )}
                  </div>

                  {/* Cart items */}
                  {saleCart.length > 0 && (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-md p-2">
                      {saleCart.map(item => (
                        <div key={item.product_id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">{item.product_model}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              placeholder="₹"
                              value={item.price}
                              onChange={e => updateCartItem(item.product_id, 'price', e.target.value)}
                              className="w-20 h-8 text-sm"
                            />
                            <div className="flex items-center gap-1">
                              <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartItem(item.product_id, 'quantity', item.quantity - 1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                              <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartItem(item.product_id, 'quantity', item.quantity + 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.product_id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Remarks (Optional)</Label>
                    <Textarea value={saleRemarks} onChange={e => setSaleRemarks(e.target.value)} />
                  </div>

                  <Button type="submit" className="w-full">Record Sale</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Shop Stock</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{totalStock}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Battery Stock</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{filterByCategory('Battery').reduce((s, i) => s + i.quantity, 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Inverter/UPS</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{filterByCategory('Inverter').reduce((s, i) => s + i.quantity, 0) + filterByCategory('UPS').reduce((s, i) => s + i.quantity, 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Trollys Stock</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{filterByCategory('Trolly').reduce((s, i) => s + i.quantity, 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Chargers Stock</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{filterByCategory('Charger').reduce((s, i) => s + i.quantity, 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">SMF Stock</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{filterByCategory('SMF').reduce((s, i) => s + i.quantity, 0)}</div></CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row mb-6">
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
            <div className="animate-pulse text-muted-foreground">Loading shop stock...</div>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All Stock</TabsTrigger>
              <TabsTrigger value="Battery">Batteries</TabsTrigger>
              <TabsTrigger value="Inverter">Inverters</TabsTrigger>
              <TabsTrigger value="UPS">UPS</TabsTrigger>
              <TabsTrigger value="Trolly">Trollys</TabsTrigger>
              <TabsTrigger value="Solar Panel">Solar Panels</TabsTrigger>
              <TabsTrigger value="Charger">Chargers</TabsTrigger>
              <TabsTrigger value="SMF">SMF</TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-3 w-3 mr-1" />
                Sales History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <Card><CardContent className="pt-6">{renderStockTable(shopStock.filter(item =>
                item.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
                item.product?.model?.toLowerCase().includes(search.toLowerCase())
              ))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Battery">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('Battery'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Inverter">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('Inverter'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="UPS">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('UPS'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Trolly">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('Trolly'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Solar Panel">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('Solar Panel'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="Charger">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('Charger'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="SMF">
              <Card><CardContent className="pt-6">{renderStockTable(filterByCategory('SMF'))}</CardContent></Card>
            </TabsContent>
            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Sales History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                     <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price (₹)</TableHead>
                        <TableHead className="text-right">Subtotal (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No sales recorded yet</TableCell>
                        </TableRow>
                      ) : salesHistory.flatMap(sale => {
                        const items = sale.items || [];
                        if (items.length === 0) {
                          return [(
                            <TableRow key={sale.id}>
                              <TableCell>{format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                              <TableCell className="font-medium">{sale.customer_name}</TableCell>
                              <TableCell colSpan={5} className="text-muted-foreground">No items</TableCell>
                            </TableRow>
                          )];
                        }
                        return items.map((item, idx) => (
                          <TableRow key={`${sale.id}-${item.id}`} className={idx > 0 ? 'border-t-0' : ''}>
                            <TableCell className={idx > 0 ? 'text-transparent' : ''}>{format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                            <TableCell className={`font-medium ${idx > 0 ? 'text-transparent' : ''}`}>{sale.customer_name}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{item.product_type}</Badge></TableCell>
                            <TableCell>{item.model_number}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{item.price ? `₹${item.price.toLocaleString('en-IN')}` : '-'}</TableCell>
                            <TableCell className="text-right font-medium">{item.price ? `₹${(item.price * item.quantity).toLocaleString('en-IN')}` : '-'}</TableCell>
                          </TableRow>
                        ));
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
