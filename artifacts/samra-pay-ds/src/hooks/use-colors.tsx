import { useColorScheme } from "react-native";
import {
  colors,
  radius,
  type NativeColorScheme,
} from "../lib/native-theme";

/**
 * Returns the design-system color palette for the active color scheme plus the
 * scheme-independent numeric radius scale.
 *
 * Pass `schemeOverride` to force a palette regardless of the device setting.
 * Samra Pay is a forced-dark brand, so its screens call `useColors('dark')`.
 */
export function useColors(schemeOverride?: NativeColorScheme) {
  const deviceScheme = useColorScheme();
  const scheme: NativeColorScheme =
    schemeOverride ?? (deviceScheme === "dark" ? "dark" : "light");
  return { ...colors[scheme], radius };
}

export default useColors;
