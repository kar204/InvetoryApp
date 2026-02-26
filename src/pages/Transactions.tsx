import { useEffect, useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Search } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { StockTransaction, Profile } from '@/types/database';
import { format } from 'date-fns';

interface ScrapEntry {
  id: string;
  customer_name: string;
  scrap_item: string;
  scrap_model: string;
  scrap_value: number;
  quantity: number;
  status: string;
  marked_out_at: string | null;
  marked_out_by: string | null;
  recorded_by: string;
  created_at: string;
}

interface ScrapTransactionRow {
  key: string;
  date: string;
  customer_name: string;
  scrap_item: string;
  scrap_model: string;
  quantity: number;
  scrap_value: number;
  type: 'IN' | 'OUT';
  recorded_by: string;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [scrapEntries, setScrapEntries] = useState<ScrapEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [transRes, scrapRes, profilesRes] = await Promise.all([
        supabase
          .from('stock_transactions')
          .select('*, product:products(*)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('scrap_entries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('profiles').select('*'),
      ]);

      setTransactions((transRes.data as StockTransaction[]) || []);
      setScrapEntries((scrapRes.data as ScrapEntry[]) || []);
      setProfiles((profilesRes.data as Profile[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProfileName = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.name || 'Unknown';
  };

  const filteredTransactions = transactions.filter(trans =>
    trans.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
    trans.remarks?.toLowerCase().includes(search.toLowerCase())
  );

  // Build dual IN/OUT rows for scrap transactions
  const scrapTransactionRows: ScrapTransactionRow[] = [];
  for (const entry of scrapEntries) {
    // Every entry has an IN record (when it was created)
    scrapTransactionRows.push({
      key: `${entry.id}-in`,
      date: entry.created_at,
      customer_name: entry.customer_name,
      scrap_item: entry.scrap_item,
      scrap_model: entry.scrap_model,
      quantity: entry.quantity || 1,
      scrap_value: entry.scrap_value,
      type: 'IN',
      recorded_by: entry.recorded_by,
    });
    // If status is OUT, also add an OUT record
    if (entry.status === 'OUT' && entry.marked_out_at) {
      scrapTransactionRows.push({
        key: `${entry.id}-out`,
        date: entry.marked_out_at,
        customer_name: entry.customer_name,
        scrap_item: entry.scrap_item,
        scrap_model: entry.scrap_model,
        quantity: entry.quantity || 1,
        scrap_value: entry.scrap_value,
        type: 'OUT',
        recorded_by: entry.marked_out_by || entry.recorded_by,
      });
    }
  }
  // Sort by date descending
  scrapTransactionRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredScrapRows = scrapTransactionRows.filter(row =>
    row.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    row.scrap_item.toLowerCase().includes(search.toLowerCase()) ||
    row.scrap_model.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">View all stock and scrap transaction history</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading transactions...</div>
          </div>
        ) : (
          <Tabs defaultValue="stock">
            <TabsList>
              <TabsTrigger value="stock">Stock Transactions ({filteredTransactions.length})</TabsTrigger>
              <TabsTrigger value="scrap">Scrap Transactions ({filteredScrapRows.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="stock">
              <Card>
                <CardHeader>
                  <CardTitle>Stock Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Handled By</TableHead>
                        <TableHead>Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((trans) => (
                          <TableRow key={trans.id}>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(trans.created_at), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium">
                              {trans.product?.name} - {trans.product?.model}
                            </TableCell>
                            <TableCell>
                              {trans.transaction_type === 'IN' ? (
                                <Badge variant="outline" className="gap-1 bg-chart-4/20 text-chart-4 border-chart-4/30">
                                  <ArrowUpCircle className="h-3 w-3" />
                                  Stock In
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 bg-destructive/20 text-destructive border-destructive/30">
                                  <ArrowDownCircle className="h-3 w-3" />
                                  Stock Out
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{trans.source}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{trans.quantity}</TableCell>
                            <TableCell>{getProfileName(trans.handled_by)}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px] truncate">
                              {trans.remarks || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scrap">
              <Card>
                <CardHeader>
                  <CardTitle>Scrap Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value (₹)</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredScrapRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No scrap transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredScrapRows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(row.date), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium">{row.customer_name}</TableCell>
                            <TableCell><Badge variant="outline">{row.scrap_item}</Badge></TableCell>
                            <TableCell>{row.scrap_model}</TableCell>
                            <TableCell>
                              {row.type === 'IN' ? (
                                <Badge variant="outline" className="gap-1 bg-chart-4/20 text-chart-4 border-chart-4/30">
                                  <ArrowUpCircle className="h-3 w-3" />
                                  IN
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 bg-destructive/20 text-destructive border-destructive/30">
                                  <ArrowDownCircle className="h-3 w-3" />
                                  OUT
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{row.quantity}</TableCell>
                            <TableCell className="text-right font-medium">₹{row.scrap_value.toLocaleString('en-IN')}</TableCell>
                            <TableCell>{getProfileName(row.recorded_by)}</TableCell>
                          </TableRow>
                        ))
                      )}
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
