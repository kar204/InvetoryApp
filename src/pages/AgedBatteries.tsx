import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Battery, ScanBarcode, CheckCircle2, XCircle, ShoppingCart, Trash2, RotateCcw, Calendar, Loader2, Camera, X, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { Product, Customer } from '@/types/database';
import { format } from 'date-fns';
import { BrowserMultiFormatReader } from '@zxing/browser';

type AgedBatteryStatus = 'IN_STOCK' | 'RENTED' | 'RETURNED' | 'SOLD' | 'SCRAPPED';

interface AgedBattery {
  id: string;
  product_id: string;
  barcode: string;
  batch_id: string | null;
  transfer_transaction_id: string | null;
  claimed: boolean;
  status: AgedBatteryStatus;
  customer_id: string | null;
  created_at: string;
  product?: Product;
  customer?: Customer;
  batch?: AgedTransferBatch;
}

interface AgedTransferBatch {
  id: string;
  batch_name: string | null;
  notes: string | null;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  created_by: string | null;
  created_at: string;
}

interface AgedBatteryRental {
  id: string;
  aged_battery_id: string;
  customer_id: string | null;
  rented_at: string;
  returned_at: string | null;
  status: 'ACTIVE' | 'RETURNED';
  created_at: string;
  aged_battery?: AgedBattery;
  customer?: Customer;
}

interface RpcResult<T = unknown> {
  data: T | null;
  error: unknown;
}

const STATUS_COLORS: Record<AgedBatteryStatus, { bg: string; text: string; label: string }> = {
  IN_STOCK: { bg: 'bg-slate-500/10', text: 'text-slate-500', label: 'In Stock' },
  RENTED: { bg: 'bg-purple-500/10', text: 'text-purple-500', label: 'Rented' },
  RETURNED: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Returned' },
  SOLD: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'Sold' },
  SCRAPPED: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Scrapped' },
};

const inferScrapCategory = (product?: Product): string => {
  const category = (product?.category || '').toLowerCase();
  const combined = `${product?.name || ''} ${product?.model || ''}`.toLowerCase();

  if (category === 'smf' || combined.includes('smf')) {
    return 'SMF';
  }

  if (combined.includes('bike') || combined.includes('motorcycle')) {
    return 'Bike Battery';
  }

  if (combined.includes('inverter')) {
    return 'Inverter Battery';
  }

  return 'Car Battery';
};

const buildAgedScrapModelLabel = (battery: AgedBattery): string => {
  const productLabel = [battery.product?.name, battery.product?.model].filter(Boolean).join(' - ');
  return productLabel || battery.barcode;
};

function extractSerial(input: string): string {
  const parts = input.split(/\s+/);
  
  for (const part of parts) {
    if (
      /[A-Z]/i.test(part) &&
      /\d/.test(part) &&
      part.length >= 8 &&
      part.length <= 15 &&
      !part.includes('-')
    ) {
      return part;
    }
  }
  
  return input;
}

export default function AgedBatteries() {
  const { user, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const isAdmin = hasRole('admin');
  const canManage = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff', 'inventory_person']);
  const canScrap = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff', 'inventory_person', 'scrap_manager']);
  const canSellRent = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff', 'inventory_person', 'seller']);

  const [activeTab, setActiveTab] = useState<'inventory' | 'transfer' | 'transactions' | 'rentals' | 'analytics'>('inventory');

  const [agedBatteries, setAgedBatteries] = useState<AgedBattery[]>([]);
  const [rentals, setRentals] = useState<AgedBatteryRental[]>([]);
  const [batches, setBatches] = useState<AgedTransferBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(false);

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scannedItems, setScannedItems] = useState<Array<{ barcode: string; productId: string; batchId: string; timestamp: Date }>>([]);
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerKey = useRef(0);

  const [isSellDialogOpen, setIsSellDialogOpen] = useState(false);
  const [isRentDialogOpen, setIsRentDialogOpen] = useState(false);
  const [isScrapDialogOpen, setIsScrapDialogOpen] = useState(false);
  const [selectedBattery, setSelectedBattery] = useState<AgedBattery | null>(null);

  const [sellForm, setSellForm] = useState({
    customer_id: '',
    notes: ''
  });
  const [sellNewCustomer, setSellNewCustomer] = useState({
    name: '',
    phone: '',
    address: ''
  });
  const [sellCreateNew, setSellCreateNew] = useState(false);

  const [rentForm, setRentForm] = useState({
    customer_id: ''
  });
  const [rentNewCustomer, setRentNewCustomer] = useState({
    name: '',
    phone: '',
    address: ''
  });
  const [rentCreateNew, setRentCreateNew] = useState(false);

  const [scrapForm, setScrapForm] = useState({
    scrap_value: '',
    remarks: ''
  });

  const filteredProducts = products.filter(p => {
    const searchLower = productSearch.toLowerCase();
    return (
      (p.category === 'SMF' || p.category === 'Battery') &&
      (p.name.toLowerCase().includes(searchLower) || 
       p.model.toLowerCase().includes(searchLower) ||
       `${p.name} ${p.model}`.toLowerCase().includes(searchLower))
    );
  });

  const fetchData = useCallback(async () => {
    try {
      const [batteriesRes, rentalsRes, batchesRes, productsRes, customersRes] = await Promise.all([
        supabase
          .from('aged_batteries')
          .select('*, product:products(*), customer:customers(*), batch:aged_transfer_batches(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('aged_battery_rentals')
          .select('*, aged_battery:aged_batteries(*, product:products(*)), customer:customers(*)')
          .order('rented_at', { ascending: false }),
        supabase
          .from('aged_transfer_batches')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
        supabase.from('customers').select('*').order('name')
      ]);

      setAgedBatteries((batteriesRes.data ?? []) as unknown as AgedBattery[]);
      setRentals((rentalsRes.data ?? []) as unknown as AgedBatteryRental[]);
      setBatches((batchesRes.data ?? []) as unknown as AgedTransferBatch[]);
      setProducts((productsRes.data ?? []) as unknown as Product[]);
      setCustomers((customersRes.data ?? []) as unknown as Customer[]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('aged-batteries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aged_batteries' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aged_battery_rentals' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aged_transfer_batches' }, () => fetchData())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchData]);

  usePollingRefresh(fetchData, 30000);

  const filteredBatteries = agedBatteries.filter(battery => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    return (
      battery.barcode?.toLowerCase().includes(searchLower) ||
      battery.product?.name?.toLowerCase().includes(searchLower) ||
      battery.product?.model?.toLowerCase().includes(searchLower) ||
      battery.customer?.name?.toLowerCase().includes(searchLower) ||
      battery.customer?.phone?.toLowerCase().includes(searchLower)
    );
  });

  const handleCreateBatch = async () => {
    if (!batchName.trim()) {
      toast({ title: 'Enter batch name', variant: 'destructive' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('aged_transfer_batches')
        .insert({ batch_name: batchName, status: 'OPEN', created_by: user?.id })
        .select()
        .single();

      if (error) throw error;

      setSelectedBatchId(data.id);
      toast({ title: 'Batch created', description: batchName });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to create batch';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const retryRpc = async <T,>(
    fn: () => Promise<RpcResult<T>>,
    retries = 3,
    delay = 1000
  ): Promise<RpcResult<T>> => {
    let lastError: unknown = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        if (!result.error) {
          return { data: result.data, error: null };
        }
        lastError = result.error;
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
      } catch (err) {
        lastError = err;
        return { data: null, error: err };
      }
    }
    
    return { data: null, error: lastError };
  };

  const processBarcode = (rawInput: string) => {
    if (!rawInput.trim()) return;

    console.log("RAW SCAN:", rawInput);

    // Extract clean serial from raw scan string
    const barcode = extractSerial(rawInput.trim());
    console.log("EXTRACTED SERIAL:", barcode);

    if (!selectedBatchId) {
      toast({ title: 'Create or select a batch first', variant: 'destructive' });
      return;
    }

    if (!selectedProductId) {
      toast({ title: 'Select a product first', variant: 'destructive' });
      return;
    }

    // Validate batch is OPEN
    const currentBatch = batches.find(b => b.id === selectedBatchId);
    if (currentBatch?.status !== 'OPEN') {
      toast({ title: 'Batch is not open', description: 'Cannot scan into a closed batch', variant: 'destructive' });
      return;
    }

    // Check for duplicate barcode in staging
    const isDuplicate = scannedItems.some(item => item.barcode === barcode);
    if (isDuplicate) {
      toast({ title: 'Duplicate barcode', description: `${barcode} already scanned`, variant: 'destructive' });
      setScannedBarcode('');
      setTimeout(() => scannerInputRef.current?.focus(), 100);
      return;
    }

    // Stage the item - NO RPC call here
    console.log("STAGING:", { barcode, productId: selectedProductId, batchId: selectedBatchId });
    
    setScannedItems(prev => [...prev, { 
      barcode, 
      productId: selectedProductId, 
      batchId: selectedBatchId, 
      timestamp: new Date() 
    }]);
    
    toast({ title: 'Barcode staged', description: barcode });
    
    // Clear input and refocus
    setScannedBarcode('');
    setTimeout(() => scannerInputRef.current?.focus(), 100);
  };

  const handleScannerKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scannedBarcode.trim()) {
      const barcode = scannedBarcode.trim();
      setScannedBarcode('');
      await processBarcode(barcode);
    }
  };

  const startCameraScanner = async () => {
    if (cameraScanning) return;
    
    // Force fresh video element by incrementing key
    scannerKey.current++;
    
    try {
      setIsCameraOpen(true);
      setCameraError(null);
      
      // Wait for dialog to render with new key
      await new Promise(resolve => setTimeout(resolve, 700));
      
      const videoElement = document.getElementById('aged-battery-camera-reader') as HTMLVideoElement;
      if (!videoElement) {
        throw new Error('Video element not found');
      }
      
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      videoElement.srcObject = stream;
      await videoElement.play();
      
      setCameraScanning(true);
      
      // Use BrowserMultiFormatReader
      const reader = new BrowserMultiFormatReader();
      
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        videoElement,
        (result, error) => {
          if (result) {
            const barcode = result.getText();
            // Stop camera immediately to prevent duplicate scans
            stopCameraScanner();
            toast({ title: 'Barcode Detected!', description: barcode });
            processBarcode(barcode);
          }
        }
      );
      
      controlsRef.current = controls;
      
    } catch (err: unknown) {
      // Stop any stream on error
      const videoElement = document.getElementById('aged-battery-camera-reader') as HTMLVideoElement;
      if (videoElement?.srcObject) {
        (videoElement.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
      }
      
      let errorMessage = 'Could not access camera.';
      if (err instanceof DOMException && err.name === 'NotAllowedError') errorMessage = 'Camera permission denied.';
      else if (err instanceof DOMException && err.name === 'NotFoundError') errorMessage = 'No camera found.';
      else if (err instanceof Error) errorMessage = err.message || 'Camera error';
      
      setCameraError(errorMessage);
      toast({ title: 'Camera Error', description: errorMessage, variant: 'destructive' });
      setCameraScanning(false);
      setIsCameraOpen(false);
    }
  };

  const stopCameraScanner = useCallback(() => {
    console.log('[CAMERA] Stopping scanner...');
    
    // Stop via controls if available
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {
        console.log('[CAMERA] Error stopping controls:', e);
      }
      controlsRef.current = null;
    }
    
    // Also manually stop any video tracks
    const videoElement = document.getElementById('aged-battery-camera-reader') as HTMLVideoElement;
    if (videoElement?.srcObject) {
      const stream = videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('[CAMERA] Stopped track:', track.kind);
      });
      videoElement.srcObject = null;
    }
    
    setCameraScanning(false);
    setIsCameraOpen(false);
  }, []);

  const restartCameraScanner = async () => {
    console.log('[CAMERA] Restarting scanner...');
    stopCameraScanner();
    await new Promise(resolve => setTimeout(resolve, 800));
    await startCameraScanner();
  };

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, [stopCameraScanner]);

  const handleCompleteBatch = async () => {
    // Defensive validation
    if (!user?.id) {
      toast({ title: 'Not authenticated', description: 'Please log in again', variant: 'destructive' });
      return;
    }

    if (!selectedBatchId) {
      toast({ title: 'Select a batch first', variant: 'destructive' });
      return;
    }

    if (!selectedProductId) {
      toast({ title: 'Select a product first', variant: 'destructive' });
      return;
    }

    if (scannedItems.length === 0) {
      toast({ title: 'No items staged', description: 'Scan barcodes first', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    const results: { success: number; failed: number; errors: string[] } = { success: 0, failed: 0, errors: [] };

    try {
      // Process each staged item
      for (let i = 0; i < scannedItems.length; i++) {
        const item = scannedItems[i];
        
        // Build payload with exact parameter names
        const payload = {
          p_product_id: item.productId,
          p_barcode: item.barcode,
          p_batch_id: item.batchId,
          p_user: user.id
        };

        // Validate payload before RPC
        if (!payload.p_product_id || !payload.p_barcode || !payload.p_batch_id || !payload.p_user) {
          const error = `Invalid payload for item ${i + 1}: ${JSON.stringify(payload)}`;
          results.failed++;
          results.errors.push(error);
          toast({ title: `Failed: ${item.barcode}`, description: 'Missing required field', variant: 'destructive' });
          continue;
        }

        try {
          const { data, error } = await retryRpc(() =>
            supabase.rpc('transfer_aged_battery', payload)
          );

          if (error) {
            results.failed++;
            const errorMsg = error.message || error.details || error.hint || JSON.stringify(error);
            results.errors.push(`${item.barcode}: ${errorMsg}`);
            toast({ title: `Failed: ${item.barcode}`, description: errorMsg, variant: 'destructive' });
          } else {
            results.success++;
            toast({ title: `Transferred: ${item.barcode}`, variant: 'default' });
          }
        } catch (err: unknown) {
          results.failed++;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          results.errors.push(`${item.barcode}: ${msg}`);
          toast({ title: `Failed: ${item.barcode}`, description: msg, variant: 'destructive' });
        }
      }

      // Only mark batch as COMPLETED if all items succeeded
      if (results.failed === 0) {
        const { error: batchError } = await supabase
          .from('aged_transfer_batches')
          .update({ status: 'COMPLETED' })
          .eq('id', selectedBatchId);

        if (batchError) throw batchError;

        toast({ 
          title: 'Batch completed', 
          description: `${results.success} items transferred successfully` 
        });

        // Clear staging
        setScannedItems([]);
        setBatchName('');
        setSelectedBatchId('');
        setSelectedProductId('');
        setIsTransferOpen(false);
      } else {
        toast({ 
          title: 'Batch partially completed', 
          description: `${results.success} succeeded, ${results.failed} failed`,
          variant: 'destructive'
        });
      }

      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to complete batch';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleClaim = async (battery: AgedBattery) => {
    setProcessing(true);
    try {
      // RPC signature: toggle_claim_status(p_claim boolean, p_id uuid)
      // p_claim = new claim status, p_id = battery ID
      const { error } = await retryRpc(() =>
        supabase.rpc('toggle_claim_status', {
          p_claim: !battery.claimed,
          p_id: battery.id
        })
      );

      if (error) throw error;

      toast({ title: battery.claimed ? 'Claim removed' : 'Battery claimed' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update claim';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSell = async () => {
    if (!user?.id) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    if (!selectedBattery) return;

    let customerId = sellForm.customer_id;

    // If creating new customer
    if (sellCreateNew) {
      if (!sellNewCustomer.name.trim() || !sellNewCustomer.phone.trim()) {
        toast({ title: 'Name and phone are required', variant: 'destructive' });
        return;
      }

      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: sellNewCustomer.name.trim(),
          phone: sellNewCustomer.phone.trim(),
          address: sellNewCustomer.address.trim() || null
        })
        .select()
        .single();

      if (customerError) {
        toast({ title: 'Failed to create customer', description: customerError.message, variant: 'destructive' });
        return;
      }
      customerId = newCustomer.id;
    }

    if (!customerId) {
      toast({ title: 'Select a customer', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        p_aged_id: selectedBattery.id,
        p_customer: customerId
      };

      const { error } = await retryRpc(() =>
        supabase.rpc('sell_aged_battery', payload)
      );

      if (error) throw error;

      toast({ title: 'Sale recorded' });
      setIsSellDialogOpen(false);
      setSellForm({ customer_id: '', notes: '' });
      setSellNewCustomer({ name: '', phone: '', address: '' });
      setSellCreateNew(false);
      setSelectedBattery(null);
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record sale';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleRent = async () => {
    if (!user?.id) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    if (!selectedBattery) return;

    let customerId = rentForm.customer_id;

    // If creating new customer
    if (rentCreateNew) {
      if (!rentNewCustomer.name.trim() || !rentNewCustomer.phone.trim() || !rentNewCustomer.address.trim()) {
        toast({ title: 'Name, phone, and address are required', variant: 'destructive' });
        return;
      }

      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: rentNewCustomer.name.trim(),
          phone: rentNewCustomer.phone.trim(),
          address: rentNewCustomer.address.trim()
        })
        .select()
        .single();

      if (customerError) {
        toast({ title: 'Failed to create customer', description: customerError.message, variant: 'destructive' });
        return;
      }
      customerId = newCustomer.id;
    }

    if (!customerId) {
      toast({ title: 'Select a customer', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        p_aged_id: selectedBattery.id,
        p_customer: customerId
      };

      const { error } = await retryRpc(() =>
        supabase.rpc('rent_aged_battery', payload)
      );

      if (error) throw error;

      toast({ title: 'Rental recorded' });
      setIsRentDialogOpen(false);
      setRentForm({ customer_id: '' });
      setRentNewCustomer({ name: '', phone: '', address: '' });
      setRentCreateNew(false);
      setSelectedBattery(null);
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record rental';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReturn = async (battery: AgedBattery) => {
    if (!user?.id) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        p_aged_id: battery.id
      };

      const { error } = await retryRpc(() =>
        supabase.rpc('return_aged_battery', payload)
      );

      if (error) throw error;

      toast({ title: 'Battery returned' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to return battery';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleScrapDialog = (battery: AgedBattery) => {
    setSelectedBattery(battery);
    setScrapForm({ scrap_value: '', remarks: '' });
    setIsScrapDialogOpen(true);
  };

  const syncScrapLedgerEntry = async (battery: AgedBattery, scrapValue: number) => {
    if (!user?.id) {
      throw new Error('Missing user for scrap ledger sync');
    }

    const customerName = battery.customer?.name?.trim() || 'Aged Battery Inventory';
    const basePayload = {
      customer_name: customerName,
      scrap_item: inferScrapCategory(battery.product),
      scrap_model: buildAgedScrapModelLabel(battery),
      scrap_value: scrapValue,
      quantity: 1,
      aged_battery_id: battery.id,
    };

    const { data: existingEntries, error: existingError } = await supabase
      .from('scrap_entries')
      .select('id')
      .eq('aged_battery_id', battery.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const existingEntryId = existingEntries?.[0]?.id;

    if (existingEntryId) {
      const { error: updateError } = await supabase
        .from('scrap_entries')
        .update(basePayload)
        .eq('id', existingEntryId);

      if (updateError) {
        throw updateError;
      }

      return;
    }

    const { error: insertError } = await supabase
      .from('scrap_entries')
      .insert({
        ...basePayload,
        recorded_by: user.id,
      });

    if (insertError) {
      throw insertError;
    }
  };

  const handleScrap = async () => {
    if (!user?.id) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    if (!selectedBattery) return;

    setProcessing(true);
    try {
      const scrapValue = parseFloat(scrapForm.scrap_value) || 0;
      const payload = {
        p_aged_id: selectedBattery.id,
        p_remarks: scrapForm.remarks || '',
        p_scrap_value: scrapValue,
        p_user: user.id
      };

      const { error } = await retryRpc(() =>
        supabase.rpc('scrap_aged_battery', payload)
      );

      if (error) throw error;

      try {
        await syncScrapLedgerEntry(selectedBattery, scrapValue);
      } catch (syncError: unknown) {
        const syncMessage = syncError instanceof Error ? syncError.message : 'Scrap register was not updated';
        console.error('Scrap ledger sync failed:', syncError);
        toast({
          title: 'Battery scrapped, but ledger sync failed',
          description: syncMessage,
          variant: 'destructive'
        });
        setIsScrapDialogOpen(false);
        setSelectedBattery(null);
        setScrapForm({ scrap_value: '', remarks: '' });
        fetchData();
        return;
      }

      toast({ title: 'Battery scrapped' });
      setIsScrapDialogOpen(false);
      setSelectedBattery(null);
      setScrapForm({ scrap_value: '', remarks: '' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to scrap battery';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (battery: AgedBattery) => {
    if (!user?.id) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    if (!confirm('This will return the battery stock to warehouse. Continue?')) return;

    setProcessing(true);
    try {
      const payload = {
        p_aged_id: battery.id,
        p_user: user.id
      };

      const { error } = await retryRpc(() =>
        supabase.rpc('admin_delete_aged_battery', payload)
      );

      if (error) throw error;

      toast({ title: 'Battery stock returned to warehouse' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to return stock';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: AgedBatteryStatus) => STATUS_COLORS[status] || STATUS_COLORS.IN_STOCK;

  const canRentStatus = (status: AgedBatteryStatus) => status === 'IN_STOCK' || status === 'RETURNED';
  const canReturnStatus = (status: AgedBatteryStatus) => status === 'RENTED';
  const canScrapStatus = (status: AgedBatteryStatus) => status === 'IN_STOCK' || status === 'RETURNED';
  const canSellStatus = (status: AgedBatteryStatus) => status === 'IN_STOCK' || status === 'RETURNED';

  const handleDeleteSale = async (battery: AgedBattery) => {
    if (!user?.id || !isAdmin) return;
    if (!confirm('This will reverse the sale and return battery to IN_STOCK. Continue?')) return;

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('reverse_sale', {
        p_aged_id: battery.id,
        p_user: user.id
      });
      if (error) throw error;
      toast({ title: 'Sale reversed', description: 'Battery returned to stock' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to reverse sale';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteRental = async (rental: AgedBatteryRental) => {
    if (!user?.id || !isAdmin) return;
    if (!confirm('This will reverse the rental and return battery to IN_STOCK. Continue?')) return;

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('reverse_rental', {
        p_rental_id: rental.id,
        p_user: user.id
      });
      if (error) throw error;
      toast({ title: 'Rental reversed', description: 'Battery returned to stock' });
      fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to reverse rental';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const analyticsCounts = {
    total: agedBatteries.length,
    inStock: agedBatteries.filter(b => b.status === 'IN_STOCK').length,
    rented: agedBatteries.filter(b => b.status === 'RENTED').length,
    returned: agedBatteries.filter(b => b.status === 'RETURNED').length,
    sold: agedBatteries.filter(b => b.status === 'SOLD').length,
    scrapped: agedBatteries.filter(b => b.status === 'SCRAPPED').length,
  };

  const openBatches = batches.filter(b => b.status === 'OPEN');

  const activeRentals = rentals.filter(r => r.status === 'ACTIVE');
  const returnedRentals = rentals.filter(r => r.status === 'RETURNED');
  const soldBatteries = agedBatteries.filter(b => b.status === 'SOLD');

  useEffect(() => {
    if (isTransferOpen && scannerInputRef.current) {
      scannerInputRef.current.focus();
    }
  }, [isTransferOpen]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Aged Batteries</h1>
            <p className="text-muted-foreground">Manage aged battery inventory, transfers, and transactions</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max min-w-full bg-muted/50">
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="transfer">Transfer Batch</TabsTrigger>
              <TabsTrigger value="transactions">Sales</TabsTrigger>
              <TabsTrigger value="rentals">Rentals</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="inventory" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by serial, product, customer, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="rounded-xl border bg-white dark:bg-[#111827]/80 backdrop-blur-xl overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Claimed</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredBatteries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No aged batteries found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBatteries.map((battery) => {
                        const statusStyle = getStatusColor(battery.status);
                        return (
                          <TableRow key={battery.id}>
                            <TableCell className="font-mono text-sm">
                              {battery.barcode || '-'}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{battery.product?.name || 'N/A'}</div>
                                <div className="text-xs text-muted-foreground">{battery.product?.model}</div>
                              </div>
                            </TableCell>
                          <TableCell className="text-sm">
                            {battery.batch?.batch_name || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>
                              {statusStyle.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {battery.claimed ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-slate-400" />
                            )}
                          </TableCell>
                          <TableCell>
                            {battery.customer ? (
                              <div>
                                <div className="font-medium">{battery.customer.name}</div>
                                <div className="text-xs text-muted-foreground">{battery.customer.phone}</div>
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canSellRent && canRentStatus(battery.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedBattery(battery);
                                    setIsRentDialogOpen(true);
                                  }}
                                >
                                  Rent
                                </Button>
                              )}
                              {canManage && canReturnStatus(battery.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleReturn(battery)}
                                  disabled={processing}
                                >
                                  Return
                                </Button>
                              )}
                              {canSellRent && canSellStatus(battery.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedBattery(battery);
                                    setIsSellDialogOpen(true);
                                  }}
                                >
                                  Sell
                                </Button>
                              )}
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleClaim(battery)}
                                >
                                  {battery.claimed ? 'Unclaim' : 'Claim'}
                                </Button>
                              )}
                              {canScrap && canScrapStatus(battery.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleScrapDialog(battery)}
                                  disabled={processing}
                                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                  title="Scrap"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && battery.status === 'IN_STOCK' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(battery)}
                                  disabled={processing}
                                  className="text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                                  title="Return to Warehouse"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transfer" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ScanBarcode className="h-5 w-5" />
                    Create / Select Batch
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Batch Name</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter batch name..."
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={handleCreateBatch} disabled={!batchName.trim()}>
                        Create
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Open Batches</Label>
                    <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a batch..." />
                      </SelectTrigger>
                      <SelectContent>
                        {openBatches.map((batch) => (
                          <SelectItem key={batch.id} value={batch.id}>
                            {batch.batch_name} ({format(new Date(batch.created_at), 'dd MMM yyyy')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ScanBarcode className="h-5 w-5" />
                    Scanner Input
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Product (SMF / Battery only)</Label>
                    <div className="relative">
                      <Input
                        placeholder="Search product..."
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setShowProductDropdown(true);
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                        className="w-full"
                      />
                      {showProductDropdown && filteredProducts.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                          {filteredProducts.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex justify-between items-center transition-colors border-b last:border-0 border-slate-100 dark:border-white/5"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedProductId(product.id);
                                setProductSearch(`${product.name} - ${product.model}`);
                                setShowProductDropdown(false);
                              }}
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{product.name}</p>
                                <p className="text-xs text-slate-500 truncate">{product.model}</p>
                              </div>
                              <Badge variant="outline" className="shrink-0 bg-slate-100 dark:bg-slate-800">
                                {product.category}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      {showProductDropdown && productSearch && filteredProducts.length === 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border border-slate-200 dark:border-white/10 rounded-xl shadow-xl p-4 text-center text-sm text-slate-500">
                          No SMF or Battery products found
                        </div>
                      )}
                    </div>
                    {selectedProductId && (
                      <p className="text-xs text-emerald-500">Selected: {filteredProducts.find(p => p.id === selectedProductId)?.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Barcode Scanner</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          ref={scannerInputRef}
                          placeholder={isMobile ? "Paste barcode here..." : "Scan barcode with USB scanner..."}
                          value={scannedBarcode}
                          onChange={(e) => setScannedBarcode(e.target.value)}
                          onKeyDown={handleScannerKeyDown}
                          className="pl-10 h-12 text-lg font-mono"
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12"
                        onClick={startCameraScanner}
                        disabled={cameraScanning}
                        title="Scan with phone camera"
                      >
                        <Camera className="h-5 w-5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isMobile
                        ? "Paste barcode or tap camera icon to scan"
                        : "Use USB scanner or tap camera icon to scan with phone"
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        Staged Items ({scannedItems.length})
                        {scannedItems.length > 0 && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-500">
                            Pending Transfer
                          </Badge>
                        )}
                      </span>
                      {selectedBatchId && (
                        <span className="text-sm font-normal text-muted-foreground">
                          Batch: {batches.find(b => b.id === selectedBatchId)?.batch_name || 'Unknown'}
                          {selectedProductId && ` | Product: ${filteredProducts.find(p => p.id === selectedProductId)?.name}`}
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={handleCompleteBatch}
                      disabled={processing || !selectedBatchId || scannedItems.length === 0}
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Transfer Batch ({scannedItems.length})
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {scannedItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ScanBarcode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No items staged yet</p>
                      <p className="text-xs">Scan barcodes to add items to transfer</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 max-h-64 overflow-y-auto">
                      {scannedItems.map((item, index) => {
                        const product = products.find(p => p.id === item.productId);
                        return (
                          <div key={index} className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-muted/50">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-6">{index + 1}.</span>
                              <span className="font-mono font-medium bg-muted px-2 py-1 rounded text-sm">
                                {item.barcode}
                              </span>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-sm">{product?.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-red-500 hover:text-red-600"
                              onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== index))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

            <Card>
              <CardHeader>
                <CardTitle>Batch History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                          No batches yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      batches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell>{batch.batch_name || '-'}</TableCell>
                          <TableCell>
                            <Badge className={
                              batch.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' :
                              batch.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500' :
                              'bg-amber-500/10 text-amber-500'
                            }>
                              {batch.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(batch.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-emerald-500" />
                  Sales Transactions ({soldBatteries.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {soldBatteries.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No sales yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Barcode</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Date</TableHead>
                          {isAdmin && <TableHead className="w-[80px]">Action</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {soldBatteries.map((battery) => (
                          <TableRow key={battery.id}>
                            <TableCell className="font-mono">{battery.barcode}</TableCell>
                            <TableCell>{battery.product?.name}</TableCell>
                            <TableCell>{battery.customer?.name || 'N/A'}</TableCell>
                            <TableCell>{battery.customer?.phone || '-'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{battery.customer?.address || '-'}</TableCell>
                            <TableCell>{format(new Date(battery.created_at), 'dd MMM yyyy')}</TableCell>
                            {isAdmin && (
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteSale(battery)}
                                  disabled={processing}
                                  className="text-red-500 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rentals" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-purple-500" />
                    Active Rentals ({activeRentals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {activeRentals.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No active rentals</p>
                  ) : (
                    <div className="space-y-3">
                      {activeRentals.map((rental) => (
                        <div key={rental.id} className="p-3 rounded-lg border bg-purple-500/5 border-purple-500/20">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">{rental.customer?.name || 'N/A'}</div>
                              <div className="text-sm text-muted-foreground font-mono">
                                {rental.aged_battery?.barcode || 'N/A'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {rental.aged_battery?.product?.name}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-purple-500/10 text-purple-500">Active</Badge>
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteRental(rental)}
                                  disabled={processing}
                                  className="text-red-500 hover:text-red-600 h-6 px-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{format(new Date(rental.rented_at), 'dd MMM yyyy')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-emerald-500" />
                    Returned Rentals ({returnedRentals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {returnedRentals.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No returned rentals</p>
                  ) : (
                    <div className="space-y-3">
                      {returnedRentals.map((rental) => (
                        <div key={rental.id} className="p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">{rental.customer?.name || 'N/A'}</div>
                              <div className="text-sm text-muted-foreground font-mono">
                                {rental.aged_battery?.barcode || 'N/A'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {rental.aged_battery?.product?.name}
                              </div>
                            </div>
                            <Badge className="bg-emerald-500/10 text-emerald-500">Returned</Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Rented: {format(new Date(rental.rented_at), 'dd MMM yyyy')}</span>
                            {rental.returned_at && (
                              <span>Returned: {format(new Date(rental.returned_at), 'dd MMM yyyy')}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold">{analyticsCounts.total}</div>
                  <p className="text-sm text-muted-foreground">Total Batteries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-slate-500">{analyticsCounts.inStock}</div>
                  <p className="text-sm text-muted-foreground">In Stock</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-purple-500">{analyticsCounts.rented}</div>
                  <p className="text-sm text-muted-foreground">Rented Out</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-amber-500">{analyticsCounts.returned}</div>
                  <p className="text-sm text-muted-foreground">Returned</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-emerald-500">{analyticsCounts.sold}</div>
                  <p className="text-sm text-muted-foreground">Sold</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-red-500">{analyticsCounts.scrapped}</div>
                  <p className="text-sm text-muted-foreground">Scrapped</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                      <span>Total Batches</span>
                      <span className="font-bold">{batches.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-amber-500/5">
                      <span>Open Batches</span>
                      <span className="font-bold text-amber-500">{openBatches.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-500/5">
                      <span>Completed Batches</span>
                      <span className="font-bold text-emerald-500">{batches.filter(b => b.status === 'COMPLETED').length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rental Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                      <span>Total Rentals</span>
                      <span className="font-bold">{rentals.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-purple-500/5">
                      <span>Active Rentals</span>
                      <span className="font-bold text-purple-500">{activeRentals.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-500/5">
                      <span>Returned Rentals</span>
                      <span className="font-bold text-emerald-500">{returnedRentals.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isCameraOpen} onOpenChange={(open) => {
        if (!open) stopCameraScanner();
        setIsCameraOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Scan Barcode with Camera
              {cameraScanning && <span className="ml-2 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cameraError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {cameraError}
              </div>
            )}
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video 
                key={`scanner-${scannerKey.current}`}
                id="aged-battery-camera-reader" 
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {!cameraScanning && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="text-center text-white">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p>Starting camera...</p>
                  </div>
                </div>
              )}
              {cameraScanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-4/5 h-1/3 border-2 border-emerald-400 rounded-lg opacity-60"></div>
                </div>
              )}
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Position the barcode within the green frame
              {cameraScanning && ' - Hold steady'}
            </p>
            

            <div className="flex gap-2">
              <Input
                placeholder="Or enter barcode manually..."
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                onKeyDown={handleScannerKeyDown}
                className="flex-1 font-mono"
              />
              <Button onClick={() => {
                if (scannedBarcode.trim()) {
                  processBarcode(scannedBarcode.trim());
                  setScannedBarcode('');
                }
              }}>
                Add
              </Button>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            {cameraError && (
              <Button variant="outline" onClick={restartCameraScanner}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Camera
              </Button>
            )}
            <Button variant="outline" onClick={stopCameraScanner}>
              <X className="h-4 w-4 mr-2" />
              Close Scanner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSellDialogOpen} onOpenChange={(open) => {
        setIsSellDialogOpen(open);
        if (!open) {
          setSellCreateNew(false);
          setSellNewCustomer({ name: '', phone: '', address: '' });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell Aged Battery</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Barcode</div>
              <div className="font-mono font-medium">{selectedBattery?.barcode}</div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant={!sellCreateNew ? "default" : "outline"} 
                size="sm"
                onClick={() => setSellCreateNew(false)}
              >
                Existing Customer
              </Button>
              <Button 
                variant={sellCreateNew ? "default" : "outline"} 
                size="sm"
                onClick={() => setSellCreateNew(true)}
              >
                New Customer
              </Button>
            </div>

            {!sellCreateNew ? (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={sellForm.customer_id} onValueChange={(v) => setSellForm({ ...sellForm, customer_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Walk-in)</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Customer Name *</Label>
                  <Input
                    placeholder="Enter customer name..."
                    value={sellNewCustomer.name}
                    onChange={(e) => setSellNewCustomer({ ...sellNewCustomer, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone *</Label>
                  <Input
                    placeholder="Enter phone number..."
                    value={sellNewCustomer.phone}
                    onChange={(e) => setSellNewCustomer({ ...sellNewCustomer, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address (Optional)</Label>
                  <Input
                    placeholder="Enter address..."
                    value={sellNewCustomer.address}
                    onChange={(e) => setSellNewCustomer({ ...sellNewCustomer, address: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                placeholder="Add notes..."
                value={sellForm.notes}
                onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsSellDialogOpen(false);
              setSellCreateNew(false);
              setSellNewCustomer({ name: '', phone: '', address: '' });
            }}>Cancel</Button>
            <Button onClick={handleSell} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
              Record Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRentDialogOpen} onOpenChange={(open) => {
        setIsRentDialogOpen(open);
        if (!open) {
          setRentCreateNew(false);
          setRentNewCustomer({ name: '', phone: '', address: '' });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rent Aged Battery</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Barcode</div>
              <div className="font-mono font-medium">{selectedBattery?.barcode}</div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant={!rentCreateNew ? "default" : "outline"} 
                size="sm"
                onClick={() => setRentCreateNew(false)}
              >
                Existing Customer
              </Button>
              <Button 
                variant={rentCreateNew ? "default" : "outline"} 
                size="sm"
                onClick={() => setRentCreateNew(true)}
              >
                New Customer
              </Button>
            </div>

            {!rentCreateNew ? (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={rentForm.customer_id} onValueChange={(v) => setRentForm({ ...rentForm, customer_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Walk-in)</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Customer Name *</Label>
                  <Input
                    placeholder="Enter customer name..."
                    value={rentNewCustomer.name}
                    onChange={(e) => setRentNewCustomer({ ...rentNewCustomer, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone *</Label>
                  <Input
                    placeholder="Enter phone number..."
                    value={rentNewCustomer.phone}
                    onChange={(e) => setRentNewCustomer({ ...rentNewCustomer, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address *</Label>
                  <Input
                    placeholder="Enter address (required for rent)..."
                    value={rentNewCustomer.address}
                    onChange={(e) => setRentNewCustomer({ ...rentNewCustomer, address: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsRentDialogOpen(false);
              setRentCreateNew(false);
              setRentNewCustomer({ name: '', phone: '', address: '' });
            }}>Cancel</Button>
            <Button onClick={handleRent} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
              Record Rental
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isScrapDialogOpen} onOpenChange={setIsScrapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scrap Aged Battery</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Barcode</div>
              <div className="font-mono font-medium">{selectedBattery?.barcode}</div>
            </div>
            <div className="space-y-2">
              <Label>Scrap Value</Label>
              <Input
                type="number"
                placeholder="Enter scrap value..."
                value={scrapForm.scrap_value}
                onChange={(e) => setScrapForm({ ...scrapForm, scrap_value: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Remarks (Optional)</Label>
              <Input
                placeholder="Enter remarks..."
                value={scrapForm.remarks}
                onChange={(e) => setScrapForm({ ...scrapForm, remarks: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScrapDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleScrap} disabled={processing} variant="destructive">
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Scrap Battery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
