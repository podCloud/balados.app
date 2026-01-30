import { useContext } from "react";
import { DownloadContext, type DownloadContextType } from "./downloadContext";

export const useDownload = (): DownloadContextType => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error("useDownload must be used within a DownloadProvider");
  }
  return context;
};
