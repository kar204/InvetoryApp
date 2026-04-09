import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  progress?: number;
  progressLabel?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'warning' | 'success';
}

const iconVariantStyles = {
  default: 'bg-slate-100 text-slate-600 shadow-[0_0_15px_rgba(148,163,184,0.12)] ring-1 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-700',
  primary: 'bg-[#4F8CFF]/10 text-[#4F8CFF] shadow-[0_0_15px_rgba(79,140,255,0.25)] ring-1 ring-[#4F8CFF]/30',
  secondary: 'bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/30',
  warning: 'bg-amber-500/10 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/30',
  success: 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(34,197,94,0.25)] ring-1 ring-emerald-500/30',
};

const borderStyles = {
  default: 'hover:border-slate-600',
  primary: 'hover:border-[#4F8CFF]/50',
  secondary: 'hover:border-indigo-500/50',
  warning: 'hover:border-amber-500/50',
  success: 'hover:border-emerald-500/50',
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendValue,
  progress,
  progressLabel,
  variant = 'default'
}: StatsCardProps) {
  const isUp = trend === 'up';
  const isDown = trend === 'down';

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.15, ease: "easeOut" } }}
      className={cn(
        "relative rounded-2xl bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 p-6 shadow-md transition-all duration-150 ease-out isolate overflow-hidden group/card gpu-smooth",
        borderStyles[variant]
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className={cn(
        "absolute -inset-px rounded-2xl opacity-0 group-hover/card:opacity-10 transition-opacity duration-300 blur-sm pointer-events-none",
        variant === 'primary' ? 'bg-[#4F8CFF]' : variant === 'success' ? 'bg-emerald-500' : 'bg-white'
      )} />

      <div className="flex items-start justify-between relative z-10 space-y-0">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14px] font-medium text-slate-600 dark:text-slate-400">{title}</p>
          <div className="flex items-end gap-3">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-[32px] font-bold tracking-tight text-slate-900 dark:text-white"
              title={String(value)}
            >
              {value}
            </motion.p>

            {trendValue && (
              <div className={cn(
                "flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-md mb-2",
                isUp ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                  isDown ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                    "bg-slate-500/10 text-slate-600 border border-slate-500/20 dark:text-slate-300"
              )}>
                {isUp && <TrendingUp className="h-3 w-3" />}
                {isDown && <TrendingDown className="h-3 w-3" />}
                {trendValue}
              </div>
            )}
          </div>

          {description && (
            <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-slate-600"></span>
              {description}
            </p>
          )}
          {typeof progress === 'number' && progressLabel && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
                <span>{progressLabel}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4F8CFF] to-[#22C55E] transition-all duration-300 ease-out gpu-smooth"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform duration-150 ease-out group-hover/card:scale-105',
          iconVariantStyles[variant]
        )}>
          <Icon className="h-5 w-5 drop-shadow-md" strokeWidth={2.5} />
        </div>
      </div>
    </motion.div>
  );
}
