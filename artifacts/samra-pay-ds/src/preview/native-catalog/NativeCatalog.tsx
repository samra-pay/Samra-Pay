/**
 * Native Component Catalog — Web Reference
 *
 * This is a React (web) file that documents all native components.
 * It shows import paths, props, and usage examples as code.
 * It is NOT a full Expo app and does not run native components in the browser.
 * For live native preview, use the Expo app in artifacts/samra-pay-mobile.
 */
import React from "react";

interface ComponentDocProps {
  name: string;
  importPath: string;
  description: string;
  props?: Array<{ name: string; type: string; required?: boolean; default?: string; description: string }>;
  example: string;
  notes?: string[];
}

function ComponentDoc({ name, importPath, description, props = [], example, notes = [] }: ComponentDocProps) {
  return (
    <div style={{ marginBottom: 48, borderBottom: "1px solid #1f1f1f", paddingBottom: 32 }}>
      <h3 style={{ color: "#d4af37", fontFamily: "Outfit, sans-serif", fontSize: 18, marginBottom: 4 }}>
        {name}
      </h3>
      <code style={{ color: "#adadad", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
        {importPath}
      </code>
      <p style={{ color: "#f5f5f5", fontFamily: "Outfit, sans-serif", fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
        {description}
      </p>
      {props.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ color: "#adadad", fontFamily: "Outfit, sans-serif", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Props
          </h4>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                {["Prop", "Type", "Required", "Default", "Description"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "#adadad", fontFamily: "Outfit, sans-serif" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.map(p => (
                <tr key={p.name} style={{ borderBottom: "1px solid #1f1f1f" }}>
                  <td style={{ padding: "4px 8px", color: "#d4af37", fontFamily: "ui-monospace, monospace" }}>{p.name}</td>
                  <td style={{ padding: "4px 8px", color: "#e9d99a", fontFamily: "ui-monospace, monospace" }}>{p.type}</td>
                  <td style={{ padding: "4px 8px", color: p.required ? "#6b9a78" : "#adadad" }}>{p.required ? "yes" : "no"}</td>
                  <td style={{ padding: "4px 8px", color: "#adadad", fontFamily: "ui-monospace, monospace" }}>{p.default ?? "—"}</td>
                  <td style={{ padding: "4px 8px", color: "#f5f5f5", fontFamily: "Outfit, sans-serif" }}>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <h4 style={{ color: "#adadad", fontFamily: "Outfit, sans-serif", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Usage
        </h4>
        <pre style={{ backgroundColor: "#0f0f0f", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, color: "#f5f5f5", fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>
          {example}
        </pre>
      </div>
      {notes.length > 0 && (
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          {notes.map((n, i) => (
            <li key={i} style={{ color: "#adadad", fontFamily: "Outfit, sans-serif", fontSize: 13, lineHeight: 1.6 }}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NativeCatalog() {
  return (
    <div style={{ backgroundColor: "#0a0a0a", minHeight: "100vh", padding: "32px 24px", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ color: "#d4af37", fontFamily: "\"EB Garamond\", serif", fontSize: 36, marginBottom: 8 }}>
        Native Component Catalog
      </h1>
      <p style={{ color: "#adadad", fontFamily: "Outfit, sans-serif", fontSize: 14, marginBottom: 8 }}>
        React Native components from <code style={{ color: "#e9d99a" }}>@workspace/samra-pay-ds</code>.
        Not live-rendered here — use the Expo app for device preview.
      </p>
      <p style={{ color: "#adadad", fontFamily: "Outfit, sans-serif", fontSize: 13, marginBottom: 32 }}>
        Full inventory: <code style={{ color: "#e9d99a" }}>docs/references/native-component-inventory.md</code>
      </p>

      <h2 style={{ color: "#f5f5f5", fontFamily: "Outfit, sans-serif", fontSize: 22, marginBottom: 24, marginTop: 40 }}>
        Primitive Components
      </h2>

      <ComponentDoc
        name="Text"
        importPath="import { Text } from '@workspace/samra-pay-ds/components/native';"
        description="Semantic typography component. Applies design-system font, size, weight, and line height based on the variant prop."
        props={[
          { name: "variant", type: "TextVariant", required: false, default: "body-md", description: "Typography role. 20 options: display-xl through ethiopic-label." },
          { name: "color", type: "string", required: false, description: "Override text color (hex). Defaults to scheme foreground." },
          { name: "scheme", type: "'light' | 'dark'", required: false, default: "'dark'", description: "Color scheme override." },
          { name: "allowFontScaling", type: "boolean", required: false, default: "true", description: "Respect system font scaling. Never set to false in production." },
        ]}
        example={`<Text variant="heading-md">Account Balance</Text>
<Text variant="numeric-balance" color={colors.primary}>1,234.56</Text>
<Text variant="ethiopic-body">ዝውውር ተጠናቋል</Text>
<Text variant="caption" color={colors.mutedForeground}>Updated 2 min ago</Text>`}
      />

      <ComponentDoc
        name="Button"
        importPath="import { Button } from '@workspace/samra-pay-ds/components/native';"
        description="Pressable button with 5 variants and 3 sizes. accessibilityLabel is required — TypeScript enforces this."
        props={[
          { name: "accessibilityLabel", type: "string", required: true, description: "Required for screen readers. Describe the button action." },
          { name: "variant", type: "'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive'", required: false, default: "'primary'", description: "Visual variant." },
          { name: "size", type: "'sm' | 'md' | 'lg'", required: false, default: "'md'", description: "Size. All sizes enforce minimum touch targets." },
          { name: "loading", type: "boolean", required: false, default: "false", description: "Shows Spinner, disables press." },
          { name: "disabled", type: "boolean", required: false, default: "false", description: "Disabled state (0.38 opacity)." },
        ]}
        example={`<Button
  variant="primary"
  size="lg"
  accessibilityLabel="Confirm transfer of 100 USD"
  onPress={handleConfirm}
  loading={isSubmitting}
>
  Confirm & Send
</Button>`}
        notes={["Minimum height: 48px (enforced)", "pressedOpacity: 0.75, disabledOpacity: 0.38"]}
      />

      <ComponentDoc
        name="StatusBadge"
        importPath="import { StatusBadge } from '@workspace/samra-pay-ds/components/native';"
        description="Financial status badge — always renders icon + text. Never color alone. Accessibility-compliant by design."
        props={[
          { name: "status", type: "FinancialStatus", required: true, description: "One of: neutral | information | warning | submitted | processing | completed | failed | cancelled | refundPending | refunded | reversed | stale | offline | unavailable" },
          { name: "label", type: "string", required: false, description: "Override default status label text." },
          { name: "size", type: "'sm' | 'md'", required: false, default: "'md'", description: "Badge size." },
        ]}
        example={`<StatusBadge status="completed" />
<StatusBadge status="processing" label="Sending..." size="sm" />
<StatusBadge status="failed" label="Transfer failed" />`}
        notes={["textRequired is always true — never use color alone", "accessibilityLabel reads 'Status: [label]'"]}
      />

      <ComponentDoc
        name="CurrencyInput"
        importPath="import { CurrencyInput } from '@workspace/samra-pay-ds/components/native';"
        description="Currency amount input — display wrapper only. Never reformats the value. Consumer passes exact string."
        props={[
          { name: "value", type: "string", required: true, description: "Exact string to display. Never parsed internally." },
          { name: "currency", type: "string", required: true, description: "ISO 4217 currency code (e.g., 'USD', 'ETB')." },
          { name: "onChangeText", type: "(text: string) => void", required: false, description: "Called on user input." },
        ]}
        example={`<CurrencyInput
  value={amount}
  currency="USD"
  onChangeText={setAmount}
  label="Send amount"
  placeholder="0.00"
  accessibilityLabel="USD amount to send"
/>`}
        notes={["Never use parseFloat/toFixed inside — display as-is", "Consumer handles number formatting"]}
      />

      <ComponentDoc
        name="ModalShell"
        importPath="import { ModalShell } from '@workspace/samra-pay-ds/components/native';"
        description="React Native Modal with design-system styling. Consumer provides safe area insets."
        props={[
          { name: "visible", type: "boolean", required: true, description: "Controls modal visibility." },
          { name: "onClose", type: "() => void", required: true, description: "Called on backdrop press or Android back button." },
          { name: "safeAreaInsets", type: "EdgeInsets", required: false, description: "From useSafeAreaInsets(). Do not hardcode." },
          { name: "size", type: "'sm' | 'md' | 'lg'", required: false, default: "'md'", description: "Max width: 360 | 480 | 640px." },
        ]}
        example={`const insets = useSafeAreaInsets();
<ModalShell
  visible={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Transfer"
  safeAreaInsets={insets}
  size="md"
>
  {/* modal content */}
</ModalShell>`}
        notes={["Always pass safeAreaInsets from useSafeAreaInsets()", "accessibilityViewIsModal is set automatically"]}
      />

      <h2 style={{ color: "#f5f5f5", fontFamily: "Outfit, sans-serif", fontSize: 22, marginBottom: 24, marginTop: 48 }}>
        Fintech Pattern Components
      </h2>

      <ComponentDoc
        name="QuotePanel"
        importPath="import { QuotePanel } from '@workspace/samra-pay-ds/components/native/patterns';"
        description="Remittance quote display. Presentation-only — never calculates rates or fees. Consumer provides isNearExpiry to show expiry warning."
        props={[
          { name: "sendAmount", type: "string", required: true, description: "Exact send amount string." },
          { name: "receiveAmount", type: "string", required: true, description: "Exact receive amount string." },
          { name: "exchangeRate", type: "string", required: true, description: "Exact rate string — do not calculate." },
          { name: "isNearExpiry", type: "boolean", required: false, default: "false", description: "Consumer signals <60s remain — shows StaleDataNotice." },
          { name: "isExpired", type: "boolean", required: false, default: "false", description: "Rate has expired — shows expiry warning, disable submit in parent." },
        ]}
        example={`<QuotePanel
  sendAmount="100.00"
  sendCurrency="USD"
  receiveAmount="5,645.00"
  receiveCurrency="ETB"
  exchangeRate="56.45"
  fee="2.99"
  feeCurrency="USD"
  expiresAt="Rate valid for 4:32"
  isNearExpiry={secondsRemaining < 60}
  isExpired={secondsRemaining <= 0}
  onRefresh={refreshQuote}
/>`}
        notes={["Never calculate exchangeRate = receiveAmount / sendAmount", "Show isNearExpiry warning when consumer detects < 60s remaining"]}
      />

      <ComponentDoc
        name="TransferStatus"
        importPath="import { TransferStatus } from '@workspace/samra-pay-ds/components/native/patterns';"
        description="Transfer status display. Always shows transferId as visible reference. Always shows text + icon — never color alone."
        props={[
          { name: "status", type: "TransferStatusValue", required: true, description: "Financial status." },
          { name: "transferId", type: "string", required: true, description: "Transfer reference ID — always visible, always selectable." },
          { name: "actions", type: "Array<{label, onPress}>", required: false, description: "Action buttons (retry, contact support, etc.)." },
        ]}
        example={`<TransferStatus
  status="processing"
  transferId="TXN-123456-ABCD"
  title="Your transfer is being processed"
  subtitle="We'll notify you when funds are delivered"
  actions={[
    { label: "View details", onPress: goToDetails },
    { label: "Contact support", onPress: openSupport },
  ]}
/>`}
        notes={["transferId must always be visible — for support reference", "Use role='alert' for failed/cancelled statuses (StatusBadge handles this)"]}
      />

      <ComponentDoc
        name="ConfirmationPanel"
        importPath="import { ConfirmationPanel } from '@workspace/samra-pay-ds/components/native/patterns';"
        description="Pre-submission review panel. Shows all values — rate, fee, amounts — before confirm button. Never calculates anything."
        props={[
          { name: "sendAmount", type: "string", required: true, description: "Exact send amount." },
          { name: "exchangeRate", type: "string", required: true, description: "Exact rate — do not calculate." },
          { name: "disclaimer", type: "string", required: false, description: "Required regulatory/disclosure text." },
          { name: "onConfirm", type: "() => void", required: true, description: "Called when user confirms." },
        ]}
        example={`<ConfirmationPanel
  sendAmount="100.00" sendCurrency="USD"
  receiveAmount="5,645.00" receiveCurrency="ETB"
  fee="2.99" feeCurrency="USD"
  exchangeRate="56.45"
  expiresAt="Rate expires in 3:45"
  recipientName="Tigist Bekele"
  deliveryMethod="Bank transfer"
  onConfirm={submitTransfer}
  onBack={() => navigation.goBack()}
  isLoading={isSubmitting}
  disclaimer="By confirming, you agree to our terms and the exchange rate shown."
/>`}
        notes={["Rate and fee must be visible before confirm button", "Never auto-submit — require explicit user action"]}
      />

      <div style={{ marginTop: 48, padding: 16, backgroundColor: "#0f0f0f", borderRadius: 8, borderLeft: "3px solid #d4af37" }}>
        <p style={{ color: "#adadad", fontFamily: "Outfit, sans-serif", fontSize: 13, margin: 0 }}>
          <strong style={{ color: "#e9d99a" }}>Full inventory:</strong>{" "}
          22 primitive + 15 fintech pattern components. See{" "}
          <code style={{ color: "#d4af37" }}>docs/references/native-component-inventory.md</code> for the complete list with all props.
        </p>
      </div>
    </div>
  );
}

export default NativeCatalog;
