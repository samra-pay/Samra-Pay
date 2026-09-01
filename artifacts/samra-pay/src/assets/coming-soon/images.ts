import heroAvif1200 from "./generated/hero-woman-coffee-1200.avif";
import heroAvif640 from "./generated/hero-woman-coffee-640.avif";
import heroAvif960 from "./generated/hero-woman-coffee-960.avif";
import heroWebp1200 from "./generated/hero-woman-coffee-1200.webp";
import heroWebp640 from "./generated/hero-woman-coffee-640.webp";
import heroWebp960 from "./generated/hero-woman-coffee-960.webp";
import patternAvif640 from "./generated/tibeb-pattern-gold-640.avif";
import patternWebp640 from "./generated/tibeb-pattern-gold-640.webp";
import proofAvif1200 from "./generated/proof-man-laptop-1200.avif";
import proofAvif640 from "./generated/proof-man-laptop-640.avif";
import proofAvif960 from "./generated/proof-man-laptop-960.avif";
import proofWebp1200 from "./generated/proof-man-laptop-1200.webp";
import proofWebp640 from "./generated/proof-man-laptop-640.webp";
import proofWebp960 from "./generated/proof-man-laptop-960.webp";
import elderAvif1000 from "./generated/values-portrait-elder-v2-1000.avif";
import elderWebp1000 from "./generated/values-portrait-elder-v2-1000.webp";
import manAvif1000 from "./generated/values-portrait-man-v2-1000.avif";
import manWebp1000 from "./generated/values-portrait-man-v2-1000.webp";
import womanAvif1000 from "./generated/values-portrait-woman-v2-1000.avif";
import womanWebp1000 from "./generated/values-portrait-woman-v2-1000.webp";
import phoneAvif1024 from "./generated/woman-with-phone-diaspora-1024.avif";
import phoneAvif640 from "./generated/woman-with-phone-diaspora-640.avif";
import phoneAvif960 from "./generated/woman-with-phone-diaspora-960.avif";
import phoneWebp1024 from "./generated/woman-with-phone-diaspora-1024.webp";
import phoneWebp640 from "./generated/woman-with-phone-diaspora-640.webp";
import phoneWebp960 from "./generated/woman-with-phone-diaspora-960.webp";

export type PublicPictureAsset = Readonly<{
  avifSrcSet: string;
  webpSrcSet: string;
  fallbackSrc: string;
  width: number;
  height: number;
  sizes?: string;
}>;

export const heroWomanCoffee: PublicPictureAsset = Object.freeze({
  avifSrcSet: `${heroAvif640} 640w, ${heroAvif960} 960w, ${heroAvif1200} 1200w`,
  webpSrcSet: `${heroWebp640} 640w, ${heroWebp960} 960w, ${heroWebp1200} 1200w`,
  fallbackSrc: heroWebp1200,
  width: 1200,
  height: 1499,
  sizes: "(max-width: 860px) 100vw, 50vw",
});

export const proofManLaptop: PublicPictureAsset = Object.freeze({
  avifSrcSet: `${proofAvif640} 640w, ${proofAvif960} 960w, ${proofAvif1200} 1200w`,
  webpSrcSet: `${proofWebp640} 640w, ${proofWebp960} 960w, ${proofWebp1200} 1200w`,
  fallbackSrc: proofWebp1200,
  width: 1200,
  height: 675,
  sizes: "(max-width: 860px) 100vw, 52vw",
});

export const womanWithPhone: PublicPictureAsset = Object.freeze({
  avifSrcSet: `${phoneAvif640} 640w, ${phoneAvif960} 960w, ${phoneAvif1024} 1024w`,
  webpSrcSet: `${phoneWebp640} 640w, ${phoneWebp960} 960w, ${phoneWebp1024} 1024w`,
  fallbackSrc: phoneWebp1024,
  width: 1024,
  height: 1024,
  sizes: "(max-width: 860px) 100vw, 54vw",
});

export const valuesPortraitWoman: PublicPictureAsset = Object.freeze({
  avifSrcSet: womanAvif1000,
  webpSrcSet: womanWebp1000,
  fallbackSrc: womanWebp1000,
  width: 1000,
  height: 1000,
});

export const valuesPortraitMan: PublicPictureAsset = Object.freeze({
  avifSrcSet: manAvif1000,
  webpSrcSet: manWebp1000,
  fallbackSrc: manWebp1000,
  width: 1000,
  height: 1000,
});

export const valuesPortraitElder: PublicPictureAsset = Object.freeze({
  avifSrcSet: elderAvif1000,
  webpSrcSet: elderWebp1000,
  fallbackSrc: elderWebp1000,
  width: 1000,
  height: 1000,
});

export const tibebPattern: PublicPictureAsset = Object.freeze({
  avifSrcSet: patternAvif640,
  webpSrcSet: patternWebp640,
  fallbackSrc: patternWebp640,
  width: 640,
  height: 640,
});
