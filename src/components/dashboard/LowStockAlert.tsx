import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { WarehouseStock } from '@/types/database';

interface LowStockAlertProps {
  items: WarehouseStock[];
}

export const LowStockAlert = memo(function LowStockAlert({ items }: LowStockAlertProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 68;
  const containerHeight = 280;
  const overscan = 4;
  const totalHeight = items.length * rowHeight;

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
      }
    });
  }, []);

  const { startIndex, visibleItems } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
    return {
      startIndex: start,
      visibleItems: items.slice(start, end),
    };
  }, [scrollTop, items, containerHeight]);

  return (
    <div className="glass-card rounded-2xl border-destructive/20">
      <div className="flex items-center gap-2 p-6 pb-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h3 className="text-lg font-semibold">Low Stock Alerts</h3>
      </div>
      <div className="px-6 pb-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            All stock levels are healthy ✓
          </p>
        ) : (
          <div
            ref={containerRef}
            onScroll={onScroll}
            className="relative h-[280px] overflow-y-auto styled-scrollbar virtual-list"
          >
            <div style={{ height: totalHeight }} className="relative">
              {visibleItems.map((item, idx) => {
                const absoluteIndex = startIndex + idx;
                return (
                  <div
                    key={item.id}
                    className="absolute left-0 right-0 px-1"
                    style={{ transform: `translateY(${absoluteIndex * rowHeight}px)` }}
                  >
                    <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/5 border border-destructive/15 transition-all duration-150 ease-out debounced-hover hover:bg-destructive/10 gpu-smooth">
                      <div>
                        <p className="font-medium text-sm">{item.product?.name || 'Unknown Product'}</p>
                        <p className="text-xs text-muted-foreground">{item.product?.model}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-destructive">{item.quantity}</span>
                        <span className="text-xs text-muted-foreground">units</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
