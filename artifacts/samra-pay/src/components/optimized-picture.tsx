import type { ImgHTMLAttributes } from "react";
import type { PublicPictureAsset } from "@/assets/coming-soon/images";

type OptimizedPictureProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "height" | "src" | "srcSet" | "width"
> &
  Readonly<{
    alt: string;
    asset: PublicPictureAsset;
    pictureClassName?: string;
  }>;

export function OptimizedPicture({
  alt,
  asset,
  pictureClassName,
  ...imageProps
}: OptimizedPictureProps) {
  return (
    <picture className={pictureClassName}>
      <source type="image/avif" srcSet={asset.avifSrcSet} sizes={asset.sizes} />
      <source type="image/webp" srcSet={asset.webpSrcSet} sizes={asset.sizes} />
      <img
        {...imageProps}
        src={asset.fallbackSrc}
        alt={alt}
        width={asset.width}
        height={asset.height}
      />
    </picture>
  );
}
