// Utility function for formatting SLA durations with proper granularity

export function formatSLADuration(hours: number | null): string {
  if (hours === null || hours === undefined) return '-';

  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  }

  if (hours < 24) {
    const roundedHours = Math.round(hours * 10) / 10; // 1 decimal place
    return `${roundedHours} hour${roundedHours !== 1 ? 's' : ''}`;
  }

  const days = Math.round((hours / 24) * 10) / 10; // 1 decimal place
  return `${days} day${days !== 1 ? 's' : ''}`;
}

// Example usage:
// formatSLADuration(0.25) → "15 mins"
// formatSLADuration(2.5) → "2.5 hours"
// formatSLADuration(48) → "2 days"
