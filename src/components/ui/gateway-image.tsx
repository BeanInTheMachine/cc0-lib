"use client";

import { useRef, useState } from "react";
import { ARWEAVE_GATEWAYS, extractArweaveId } from "@/lib/gateway-url";
import { cn } from "@/lib/utils";
import { File, FileImage, FileText, FolderArchive } from "lucide-react";

type GatewayImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
  filetype?: string;
};

function getFileIcon(filetype: string) {
  const ft = filetype.toLowerCase();
  if (ft === "zip") return FolderArchive;
  if (ft === "csv" || ft === "json" || ft === "plain" || ft === "txt" || ft.startsWith("csv;"))
    return FileText;
  if (ft === "postscript") return FileImage;
  return File;
}

const PRIMARY_GATEWAY = "https://arweave.net";
const FALLBACK_GATEWAYS = ARWEAVE_GATEWAYS.filter(
  (gateway) => gateway !== PRIMARY_GATEWAY
);

function normalizeSrc(src: string): string {
  const id = extractArweaveId(src);
  return id ? `${PRIMARY_GATEWAY}/${id}` : src;
}

function buildFallbackUrls(originalSrc: string): string[] {
  const id = extractArweaveId(originalSrc);
  if (!id) return [];

  return FALLBACK_GATEWAYS.map((gateway) => `${gateway}/${id}`);
}

const GatewayImage = ({
  src,
  alt,
  className,
  width,
  height,
  loading = "lazy",
  filetype,
}: GatewayImageProps) => {
  const [currentSrc, setCurrentSrc] = useState(() => normalizeSrc(src));
  const [failed, setFailed] = useState(false);
  const gatewayIndex = useRef(0);
  const fallbackUrls = useRef<string[] | null>(null);

  const handleError = () => {
    if (!fallbackUrls.current) {
      fallbackUrls.current = buildFallbackUrls(src);
    }

    const urls = fallbackUrls.current;

    if (urls && gatewayIndex.current < urls.length) {
      setCurrentSrc(urls[gatewayIndex.current]);
      gatewayIndex.current++;
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    if (filetype) {
      const Icon = getFileIcon(filetype);
      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-3 bg-zinc-800/70 p-6",
            className
          )}
          style={{ minWidth: width, minHeight: height }}
        >
          <Icon className="h-12 w-12 text-zinc-500" strokeWidth={1.5} />
          <span className="truncate text-center font-chakra text-xs uppercase tracking-wider text-zinc-400">
            {alt}
          </span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/30 text-muted-foreground text-sm p-4",
          className
        )}
        style={{ width, height }}
      >
        <span className="truncate text-center">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      onError={handleError}
    />
  );
};

export default GatewayImage;
