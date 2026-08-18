# Localization — Samra Pay Design System

This document covers design-system considerations for supporting multiple languages, primarily English and Amharic (አማርኛ).

_For copy standards and tone, see `docs/content-and-voice.md`._

---

## 1. Supported Languages

| Language | Script | Font | Direction |
|----------|--------|------|-----------|
| English | Latin | Outfit (sans), EB Garamond (display) | LTR |
| Amharic | Ge'ez (Ethiopic) | Noto Serif Ethiopic | LTR |

**Note:** Ge'ez script is left-to-right. RTL layout is not required for Amharic.

---

## 2. Typography for Localization

### Amharic text
Always use the `ethiopic` font family token:
- `fontFamily.ethiopic` (CSS: `--font-ethiopic`)
- React Native: `fontFamily.ethiopic.regular` or `fontFamily.ethiopic.semibold`

**Never** use Outfit or EB Garamond for Amharic — these fonts do not include Ethiopic glyphs.

### Line heights
Ethiopic script requires taller line heights than Latin:
- Body text: 1.7 (token: `ethiopic.body.lineHeight`)
- Heading text: 1.4
- Label text: 1.5
- Display text: 1.2

These are defined in the `textStyle.ethiopic.*` tokens.

### Text overflow
Amharic strings are typically 20–40% longer than their English equivalents. Design layouts to accommodate this:
- Allow text to wrap in labels (don't force `numberOfLines={1}` on translated strings)
- Use flexible layouts (not fixed-width containers for text)
- Test all UI strings with Amharic translations before finalizing layout

---

## 3. Number Formatting

### Ethiopian numeral system
The Ethiopic script has its own numeral characters (፩, ፪, ፫...) but modern Ethiopian usage overwhelmingly uses Western Arabic numerals (1, 2, 3...) for financial amounts.

**Samra Pay recommendation:**
- Use Western Arabic numerals for all financial amounts in both English and Amharic UI.
- Use comma as the thousands separator: `1,234,567.89`
- Use period (.) as the decimal separator.
- Do not use Ethiopic numerals for financial display.

### Currency formatting
- Always use ISO 4217 currency codes: `ETB`, `USD`, `GBP`, etc.
- Format: `[amount] [code]` — e.g., `1,234.56 ETB`
- This format works in both English and Amharic context without translation.

---

## 4. Date and Time Formatting

### Calendar systems
Ethiopia uses the Ethiopian calendar (Ge'ez calendar — 13 months). The Gregorian calendar is also widely used, especially in business contexts.

**Design-system contract:**
- The design system does NOT convert between calendar systems.
- Components accept pre-formatted date strings from the consumer.
- The consumer is responsible for formatting dates according to the user's preference and locale.
- When displaying dates, the consumer must indicate which calendar system is being used if there is ambiguity.

### Ethiopic months (for reference — consumer responsibility)
- Ethiopian year is ~7–8 years behind Gregorian
- Month names in Amharic differ from Gregorian

### Date formats
Use unambiguous formats that work in both locales:
- Full: `14 Jul 2025` (avoids `14/07/25` vs `07/14/25` ambiguity)
- Short with month: `Jul 14` (English) or equivalent Amharic if translated
- Relative: "2 minutes ago" — requires translation

---

## 5. Font Loading for Localization

The `useDesignSystemFonts()` hook loads all fonts required for both English and Amharic:

```tsx
import { useDesignSystemFonts } from '@workspace/samra-pay-ds/hooks/use-fonts';

// In root layout:
const { fontsLoaded, fontError } = useDesignSystemFonts();
// Gate rendering on fontsLoaded before showing ANY Amharic text
```

If fonts are not loaded:
- Latin text will fall back to system sans-serif (acceptable)
- Ethiopic text will fall back to system Ethiopic font (acceptable on modern Android/iOS)
- On devices without a system Ethiopic font, Ge'ez characters may appear as empty boxes ("tofu") — this is why Noto Serif Ethiopic must be loaded

---

## 6. Layout Direction

**All Samra Pay layouts are LTR.**

Amharic is a LTR language. Do not apply RTL layout for Amharic users.

If future expansion requires Arabic, Somali, or other RTL languages, the design system will need RTL support added. This is tracked as a future consideration.

---

## 7. String Length Considerations

Test all translated strings with these inputs:
- English string
- Amharic equivalent
- Long English string (e.g., "Transfer cancelled — please contact support")
- Long Amharic string (typically longer)

Components that need careful attention:
- `Button` — label wrapping or truncation
- `Badge` / `StatusBadge` — label overflow
- `ListRow` title and subtitle — `numberOfLines` limits
- `StatusBadge` — fixed badge width
- Navigation labels — `numberOfLines={1}` on nav items

---

## 8. Amharic Input

For forms where users enter Amharic text:
- Set `keyboardType="default"` (not "ascii-capable" which limits to Latin)
- On iOS, Ethiopic keyboard must be enabled in Settings → Keyboard → Add New Keyboard
- On Android, Amharic keyboard may require installing an Ethiopian keyboard app
- The design system's `Input` component supports both Latin and Ethiopic input without special configuration

---

## 9. Testing Localization

**Cannot be fully tested in this environment.** Required testing on real devices:

1. Set device language to Amharic and verify all UI strings are translated
2. Verify Noto Serif Ethiopic renders correctly on both iOS and Android
3. Verify date/time formats use user's locale
4. Verify number formatting (commas/periods) is correct
5. Test text overflow on all screens with both English and Amharic strings
6. Verify font fallback behavior when Noto Serif Ethiopic fails to load
