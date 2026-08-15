import { useFonts } from "expo-font";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import {
  EBGaramond_500Medium,
  EBGaramond_500Medium_Italic,
  EBGaramond_600SemiBold,
} from "@expo-google-fonts/eb-garamond";
import {
  NotoSerifEthiopic_400Regular,
  NotoSerifEthiopic_600SemiBold,
} from "@expo-google-fonts/noto-serif-ethiopic";

/**
 * Loads every registered weight used by the design system's native typography:
 * Outfit (sans), EB Garamond (serif), and Noto Serif Ethiopic (Amharic).
 *
 * Consuming Expo apps call this once in the root layout and keep their existing
 * SplashScreen gating around the returned `fontsLoaded` / `fontError`.
 */
export function useDesignSystemFonts() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    EBGaramond_500Medium,
    EBGaramond_500Medium_Italic,
    EBGaramond_600SemiBold,
    NotoSerifEthiopic_400Regular,
    NotoSerifEthiopic_600SemiBold,
  });

  return { fontsLoaded, fontError };
}

export default useDesignSystemFonts;
