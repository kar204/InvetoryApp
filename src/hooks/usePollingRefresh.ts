import { useEffect, useRef } from 'react';

interface PollingOptions {
  enabled?: boolean;
  /**
   * Default: only poll when the tab is visible to avoid unnecessary traffic.
   */
  onlyWhenVisible?: boolean;
}

export function usePollingRefresh(
  refresh: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, onlyWhenVisible = true }: PollingOptions = {}
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (onlyWhenVisible && document.visibilityState !== 'visible') return;
      void refreshRef.current();
    };

    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, onlyWhenVisible]);
}

