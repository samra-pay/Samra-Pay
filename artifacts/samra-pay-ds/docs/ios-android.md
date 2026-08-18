# iOS and Android Platform Notes — Samra Pay Design System

This document covers platform-specific implementation differences for native components.

> **Notice:** Physical device validation has not been performed. All claims are based on design-system specifications, React Native documentation, and platform guidelines. Validate on real devices before release.

---

## 1. Touch Targets

| Platform | Minimum | Token | Implementation |
|----------|---------|-------|----------------|
| iOS | 44pt | `interaction.touchTarget.ios` | Applied via `Math.max(sizeValue, 48)` in all pressable components |
| Android | 48dp | `interaction.touchTarget.android` | Same implementation (48 covers both) |

All `Button`, `IconButton`, `ListRow`, and pattern components enforce minimum heights. Verify on devices that the visual size matches the touch target.

---

## 2. Safe Area Insets

**Rule: Never hardcode safe area values in design-system components.**

Safe area insets vary by:
- iPhone models (notch vs Dynamic Island vs flat top)
- iPad models (bezel, stage manager)
- Android manufacturers (varied navigation bar implementations)
- Landscape vs portrait orientation

**Implementation pattern:**
```tsx
// Consumer code (Expo app)
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalShell } from '@workspace/samra-pay-ds/components/native';

function MyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      safeAreaInsets={insets}
    />
  );
}
```

Components that need safe area awareness: `ModalShell` (accepts `safeAreaInsets` prop), `BottomSheet` (consumer should pad content), `Toast`/`ToastProvider` (see `docs/open-decisions.md` for topInset decision).

---

## 3. Font Loading

**iOS:** Fonts must be loaded before rendering text. `expo-font` handles this. The `useDesignSystemFonts()` hook loads all required weights. App must gate rendering behind `fontsLoaded`:

```tsx
// Root layout
const { fontsLoaded } = useDesignSystemFonts();
if (!fontsLoaded) return <SplashScreen />;
```

**Android:** Same requirement. Expo handles cross-platform font loading uniformly.

**Fallbacks:** If fonts fail to load (`fontError`), React Native falls back to the system font. The fallback renders Latin text adequately but Amharic/Ge'ez text will use system Ethiopic font (available on modern Android, may not be on older devices). Always display a meaningful loading state.

---

## 4. Shadow (Elevation)

**iOS:** Shadows use `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`. The design system's elevation tokens define these values for each elevation level.

**Android:** Use `elevation` prop (numeric). Android ignores iOS shadow props. The `Card` component sets `elevation: 4` for elevated variant.

**Implementation:**
```tsx
// iOS shadow (from elevation token e2)
const iosShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.45,
  shadowRadius: 8,
};

// Android shadow
const androidShadow = { elevation: 4 };

// Apply both — React Native routes to appropriate platform
const shadow = { ...iosShadow, ...androidShadow };
```

---

## 5. Keyboard Handling

**iOS:** `KeyboardAvoidingView` with `behavior="padding"` for forms. `TextInput` components should set appropriate `keyboardType`:
- Currency amounts: `keyboardType="decimal-pad"` (no negative sign on iOS)
- Phone numbers: `keyboardType="phone-pad"`
- Email: `keyboardType="email-address"`

**Android:** `KeyboardAvoidingView` with `behavior="height"`. Some Android keyboards have different decimal pad implementations.

**Both:** Set `returnKeyType` to `"done"` for the last field in a form. Earlier fields should use `"next"` with `onSubmitEditing` to advance focus.

---

## 6. PanResponder (BottomSheet)

The `BottomSheet` component uses `PanResponder` for swipe-to-dismiss. Test these scenarios:

- Swipe velocity > 0.5 → close sheet
- Swipe distance > 40% of height → close sheet
- Short downward swipe → snap back
- Swipe upward → snap back (sheet stays open)
- Scroll within sheet + swipe → should prefer scroll over dismiss

The current implementation may conflict with internal `ScrollView` gestures. Test on real devices.

---

## 7. Modal Behavior

**iOS:** `Modal` with `animationType="fade"` works well. Set `accessibilityViewIsModal={true}` to trap VoiceOver focus.

**Android:** Same props. Android handles Back button as `onRequestClose` — always implement this to dismiss the modal.

**Both:** `ModalShell` implements `onRequestClose={onClose}` — consumer's `onClose` handles Back button on Android automatically.

---

## 8. Animation (Skeleton, BottomSheet)

The `Skeleton` component uses `Animated.loop` with `useNativeDriver: true`. This runs on the UI thread for smooth performance.

**Note:** `useNativeDriver: true` cannot animate layout properties (`width`, `height`, `margin`, etc.). Only `opacity`, `transform`, `scale`, `translate` work with native driver. Both Skeleton and BottomSheet follow this constraint.

---

## 9. Accessibility IDs

For automated testing (Detox, Maestro), components should accept `testID` props. Current components pass through React Native's `ViewProps` / `PressableProps` which include `testID`. Consumer teams can set these in their apps.

---

## 10. Platform-Specific Considerations

### iOS-specific
- `allowFontScaling={true}` respects Dynamic Type. Never set to `false`.
- VoiceOver focus order follows the component tree. Keep logical nesting.
- Haptic feedback (success, warning) should be added in consuming apps via `expo-haptics` — not in design-system components.

### Android-specific
- TalkBack uses `contentDescription` mapped from `accessibilityLabel`.
- `accessible={true}` on container elements groups them as a single TalkBack element.
- Android's `fontWeight` handling differs from iOS — some weights may render identically. Test bold variants.
- `elevation` prop creates a shadow AND a background clipping issue on Android — `overflow: hidden` may not work with elevation on Android.

### Both
- Never use `Platform.OS` inside design-system components to conditionally hide/show UI elements. Platform differences should be style-level only.
- If absolutely necessary, `Platform.select()` for style values is acceptable.
