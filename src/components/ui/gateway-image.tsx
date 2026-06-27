"use client";

import { useRef, useState } from "react";
import { ARWEAVE_GATEWAYS, extractArweaveId } from "@/lib/gateway-url";

type GatewayImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
};

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
}: GatewayImageProps) => {
  const [currentSrc, setCurrentSrc] = useState(() => normalizeSrc(src));
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
    }
  };

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
