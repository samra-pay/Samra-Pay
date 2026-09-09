import type { PublicPictureAsset } from "./images";
import chargeAvif428 from "./generated/samra-pay-charge-v1-428.avif";
import chargeAvif856 from "./generated/samra-pay-charge-v1-856.avif";
import chargeWebp428 from "./generated/samra-pay-charge-v1-428.webp";
import chargeWebp856 from "./generated/samra-pay-charge-v1-856.webp";
import eliteAvif428 from "./generated/samra-pay-elite-v1-428.avif";
import eliteAvif856 from "./generated/samra-pay-elite-v1-856.avif";
import eliteWebp428 from "./generated/samra-pay-elite-v1-428.webp";
import eliteWebp856 from "./generated/samra-pay-elite-v1-856.webp";
import airlineAvif428 from "./generated/samra-pay-airline-v1-428.avif";
import airlineAvif856 from "./generated/samra-pay-airline-v1-856.avif";
import airlineWebp428 from "./generated/samra-pay-airline-v1-428.webp";
import airlineWebp856 from "./generated/samra-pay-airline-v1-856.webp";
import elite100Avif428 from "./generated/samra-pay-elite-100-v1-428.avif";
import elite100Avif856 from "./generated/samra-pay-elite-100-v1-856.avif";
import elite100Webp428 from "./generated/samra-pay-elite-100-v1-428.webp";
import elite100Webp856 from "./generated/samra-pay-elite-100-v1-856.webp";

const cardDimensions = {
  width: 856,
  height: 540,
  sizes: "(max-width: 720px) calc(100vw - 78px), (max-width: 860px) 45vw, 33vw",
} as const;

export const chargeCard: PublicPictureAsset = Object.freeze({
  ...cardDimensions,
  avifSrcSet: `${chargeAvif428} 428w, ${chargeAvif856} 856w`,
  webpSrcSet: `${chargeWebp428} 428w, ${chargeWebp856} 856w`,
  fallbackSrc: chargeWebp856,
});

export const eliteCard: PublicPictureAsset = Object.freeze({
  ...cardDimensions,
  avifSrcSet: `${eliteAvif428} 428w, ${eliteAvif856} 856w`,
  webpSrcSet: `${eliteWebp428} 428w, ${eliteWebp856} 856w`,
  fallbackSrc: eliteWebp856,
});

export const airlineCard: PublicPictureAsset = Object.freeze({
  ...cardDimensions,
  avifSrcSet: `${airlineAvif428} 428w, ${airlineAvif856} 856w`,
  webpSrcSet: `${airlineWebp428} 428w, ${airlineWebp856} 856w`,
  fallbackSrc: airlineWebp856,
});

export const elite100Card: PublicPictureAsset = Object.freeze({
  ...cardDimensions,
  sizes: "(max-width: 720px) calc(100vw - 78px), 45vw",
  avifSrcSet: `${elite100Avif428} 428w, ${elite100Avif856} 856w`,
  webpSrcSet: `${elite100Webp428} 428w, ${elite100Webp856} 856w`,
  fallbackSrc: elite100Webp856,
});
