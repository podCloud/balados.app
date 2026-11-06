const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Display form of an itunes:duration value, which feeds give either as a
 * number of seconds ("3723") or as [[HH:]MM:]SS ("01:02:03"). Returns
 * H:MM:SS or M:SS, or "" when the value is missing, zero or unreadable.
 */
export const formatItunesDuration = (raw: string): string => {
  const value = raw.trim();
  let total: number;
  if (/^\d+$/.test(value)) {
    total = Number(value);
  } else if (/^\d+(:\d{1,2}){1,2}$/.test(value)) {
    total = value.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
  } else {
    return "";
  }
  if (total <= 0) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};
