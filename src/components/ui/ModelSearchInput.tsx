import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Product {
  id: string;
  name: string;
  model: string;
  category: string;
}

interface ModelSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  products: Product[];
  category: 'Battery' | 'Inverter';
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ModelSearchInput({
  value,
  onChange,
  products,
  category,
  placeholder,
  disabled,
  className,
}: ModelSearchInputProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredProducts = React.useMemo(() => {
    const categoryProducts = products.filter((p) => p.category === category);
    if (!searchQuery.trim()) {
      return categoryProducts.slice(0, 10);
    }
    const query = searchQuery.toLowerCase();
    return categoryProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.model.toLowerCase().includes(query) ||
        `${p.name} - ${p.model}`.toLowerCase().includes(query)
    );
  }, [products, category, searchQuery]);

  const isCustomModel = React.useMemo(() => {
    if (!value.trim()) return false;
    if (selectedProduct) return false;
    const query = value.toLowerCase();
    const exists = products.some(
      (p) =>
        p.category === category &&
        (p.name.toLowerCase().includes(query) ||
          p.model.toLowerCase().includes(query) ||
          `${p.name} - ${p.model}`.toLowerCase().includes(query))
    );
    return !exists;
  }, [value, selectedProduct, products, category]);

  React.useEffect(() => {
    if (selectedProduct) {
      onChange(`${selectedProduct.name} - ${selectedProduct.model}`);
    }
  }, [selectedProduct, onChange]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    onChange(newValue);
    setSelectedProduct(null);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedProduct(null);
    setSearchQuery('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && isOpen && filteredProducts.length > 0) {
      e.preventDefault();
      handleSelectProduct(filteredProducts[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        {selectedProduct ? (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-slate-50 dark:bg-slate-900/50 min-h-[42px]">
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              {category}
            </Badge>
            <span className="flex-1 text-sm truncate">{selectedProduct.name} - {selectedProduct.model}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              ref={inputRef}
              value={searchQuery || value}
              onChange={handleInputChange}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || `Search or type ${category.toLowerCase()} model...`}
              disabled={disabled}
              className={cn(
                'pr-10',
                isCustomModel && value && 'border-amber-400 dark:border-amber-600'
              )}
            />
            <ChevronDown
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        )}
      </div>

      {isOpen && !selectedProduct && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
          {filteredProducts.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              {searchQuery ? (
                <div>
                  <p>No matching models found.</p>
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                    Will be saved as custom model
                  </p>
                </div>
              ) : (
                <p>Start typing to search...</p>
              )}
            </div>
          ) : (
            <div className="py-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b mb-1">
                {searchQuery ? `Results for "${searchQuery}"` : `Popular ${category}s`}
              </div>
              {filteredProducts.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelectProduct(product)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors',
                    index === highlightedIndex && 'bg-accent'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{product.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{product.model}</div>
                    </div>
                    {index === highlightedIndex && <Check className="h-4 w-4 text-primary ml-2 flex-shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isCustomModel && value && (
        <div className="flex items-center gap-1 mt-1.5">
          <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400">
            Custom Model
          </Badge>
          <span className="text-xs text-muted-foreground truncate flex-1">{value}</span>
        </div>
      )}
    </div>
  );
}
