"use client";

import Image from "next/image";
import { useState } from "react";

export function CoverThumb({
  src,
  alt,
  size = 80,
}: {
  src: string | null | undefined;
  alt: string;
  size?: number;
}) {
  const fallback = "/no_cover_art.png";
  const [imgSrc, setImgSrc] = useState(src || fallback);
  return (
    <Image
      src={imgSrc}
      alt={alt}
      width={size}
      height={size}
      onError={() => setImgSrc("/no_cover_art.png")}
      unoptimized={imgSrc.startsWith("http")} // optional: reduces next/image proxy failures

    />
  );
}
