import { type ReactNode, useState } from "react";

interface ArtworkProps {
  src?: string | null;
  /** Tried when `src` fails to load (e.g. the show artwork for an episode). */
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  /** Shown inside the neutral box when no image can be displayed. */
  placeholder?: ReactNode;
}

/**
 * Podcast or episode artwork. Feed image URLs are often dead or slow: this
 * tries `src`, then `fallbackSrc`, then shows a neutral box of the same size
 * instead of the browser's broken-image icon (#108). Loaded lazily, since a
 * feed can list thousands of episodes.
 */
export const Artwork = ({ src, fallbackSrc, alt, className = "", placeholder }: ArtworkProps) => {
  const [failed, setFailed] = useState<string[]>([]);
  const current = [src, fallbackSrc].find(
    (candidate): candidate is string => !!candidate && !failed.includes(candidate),
  );

  if (!current) {
    return (
      <div
        data-artwork-placeholder
        className={`${className} bg-gray-200 flex items-center justify-center`}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <img
      key={current}
      src={current}
      alt={alt}
      className={`${className} object-cover`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed((list) => [...list, current])}
    />
  );
};
