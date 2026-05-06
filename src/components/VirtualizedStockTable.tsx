import React, { memo, useCallback } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { WarehouseStock, Product } from '@/types/database';
import { Package, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface Props {
  items: WarehouseStock[];
  rowHeight?: number;
  height?: number;
  onDelete?: (product: Product | null) => void;
}

const Row = memo(function Row({ index, style, data }: ListChildComponentProps) {
  const { items } = data as { items: WarehouseStock[] };
  const item = items[index];

  const health = item.quantity < 5 ? 'critical' : item.quantity < 20 ? 'warning' : 'good';
  const healthGlow = health === 'critical' ? 'shadow-[0_0_12px_rgba(239,68,68,0.5)]' : health === 'warning' ? 'shadow-[0_0_10px_rgba(251,191,36,0.3)]' : 'shadow-[0_0_10px_rgba(79,140,255,0.3)]';

  return (
    <div style={style} className="stock-row group relative flex flex-col lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 lg:gap-4 p-4 lg:items-center hover:bg-slate-50 dark:hover:bg-[#1B2438]/60 transition-colors duration-150">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4F8CFF] scale-y-0 lg:group-hover:scale-y-100 transition-transform origin-center" />

      <div className="flex justify-between items-center w-full lg:hidden mb-1">
        <div className="font-bold text-slate-800 dark:text-slate-200 truncate pr-4 text-[16px]">{item.product?.name}</div>
        <div className="text-right font-bold text-[18px] text-slate-900 dark:text-white tabular-nums drop-shadow-sm">{item.quantity} units</div>
      </div>

      <div className="hidden lg:block font-bold text-slate-800 dark:text-slate-200 truncate pr-4 text-[14px]">{item.product?.name}</div>
      <div className="text-slate-600 dark:text-slate-500 dark:text-slate-400 text-[13px] truncate flex items-center gap-2"><span className="lg:hidden uppercase text-[10px] font-bold opacity-60">Model</span>{item.product?.model}</div>
      <div className="text-slate-600 dark:text-slate-500 text-[13px] flex items-center gap-2"><span className="lg:hidden uppercase text-[10px] font-bold opacity-60">Capacity</span>{item.product?.capacity || '-'}</div>

      <div className="hidden lg:block text-right font-bold text-lg text-slate-900 dark:text-white tabular-nums drop-shadow-sm">{item.quantity}</div>

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
      </div>
    </div>
  );
});

export default function VirtualizedStockTable({ items, rowHeight = 88, height = 600 }: Props) {
  const itemData = { items };

  const RowRenderer = useCallback((props: ListChildComponentProps) => <Row {...props} data={itemData} />, [items]);

  return (
    <div className="rounded-2xl overflow-hidden">
      {items.length === 0 ? (
        <div className="p-12 text-center text-slate-600 dark:text-slate-500 font-medium flex flex-col items-center justify-center gap-3">
          <Package className="h-10 w-10 text-slate-700" />
          No products found in this category
        </div>
      ) : (
        <List
          height={Math.min(height, items.length * rowHeight)}
          itemCount={items.length}
          itemSize={rowHeight}
          width="100%"
          itemData={itemData}
        >
          {RowRenderer}
        </List>
      )}
    </div>
  );
}
