import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  ({ className, value, onChange, onClear, placeholder, ...props }, ref) => {
    const hasValue = value.length > 0;

    return (
      <div className={cn("relative flex items-center group", className)}>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-[#4F8CFF] pointer-events-none" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "flex h-11 w-full rounded-xl border border-input/80 bg-input pl-10 pr-9",
            "text-sm text-foreground placeholder:text-muted-foreground",
            "transition-all duration-200 ease-out",
            "hover:border-border",
            "focus:outline-none focus:border-[#4F8CFF]/50 focus:ring-2 focus:ring-[#4F8CFF]/20 focus:bg-input",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...props}
        />
        {hasValue && (
          <button
            type="button"
            onClick={onClear ?? (() => onChange(""))}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  },
);
SearchBar.displayName = "SearchBar";

export { SearchBar };
