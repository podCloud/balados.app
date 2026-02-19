import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLike } from "../../hooks/useLike";

interface LikeButtonProps {
  feedUrl: string;
  likeCount?: number;
  size?: "sm" | "md";
}

export const LikeButton = ({ feedUrl, likeCount, size = "sm" }: LikeButtonProps) => {
  const { t } = useTranslation();
  const { isLiked, toggleLike, isLoading } = useLike(feedUrl);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike();
  };

  const iconSize = size === "sm" ? 16 : 20;

  // Optimistic count: adjust server count based on local like state
  const displayCount = likeCount != null ? likeCount + (isLiked ? 1 : 0) : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`flex items-center gap-1 transition-colors ${
        isLiked ? "text-red-500 hover:text-red-600" : "text-gray-400 hover:text-red-400"
      }`}
      aria-label={isLiked ? t("likes.unlike") : t("likes.like")}
      title={isLiked ? t("likes.unlike") : t("likes.like")}
    >
      <Heart size={iconSize} fill={isLiked ? "currentColor" : "none"} aria-hidden="true" />
      {displayCount != null && displayCount > 0 && <span className="text-xs">{displayCount}</span>}
    </button>
  );
};
