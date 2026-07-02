// Safe URL hostname extraction
export const getFallbackTitle = (feedUrl: string): string => {
  try {
    return new URL(feedUrl).hostname;
  } catch {
    return feedUrl.length > 50 ? `${feedUrl.slice(0, 50)}...` : feedUrl;
  }
};

export const formatRelativeTime = (
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string => {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (minutes < 1) return t("syncSettings.justNow");
  if (minutes < 60) return t("syncSettings.minutesAgo", { count: minutes });
  if (hours < 24) return t("syncSettings.hoursAgo", { count: hours });
  return t("syncSettings.daysAgo", { count: days });
};
