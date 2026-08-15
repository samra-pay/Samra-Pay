import { useState } from 'react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '../../components/ui/input-otp';
import { Guidelines, Stack } from '../parts';

export function InputOtpDemo() {
  const [code, setCode] = useState('');

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Verify your transfer">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code we texted to confirm sending money to Selam.
        </p>
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        <p className="text-sm text-muted-foreground" role="status">
          {code.length === 6
            ? 'Code complete — verifying your transfer…'
            : `${code.length} of 6 digits entered.`}
        </p>
      </Stack>

      <Stack label="Prefilled — device unlock PIN">
        <InputOTP maxLength={4} defaultValue="8214">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      </Stack>

      <Stack label="Disabled — code expired">
        <InputOTP maxLength={6} defaultValue="204" disabled>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        <p className="text-sm text-destructive" role="alert">
          This code has expired. Request a new one to continue.
        </p>
        <p className="text-xs text-muted-foreground">
          Typing auto-advances; Backspace and pasting a full code both work.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use OTP entry to confirm high-stakes actions like sending money or signing in on a new device.',
            },
            {
              kind: 'do',
              text: 'Group digits (3 + 3) so a long code is easier to read back from an SMS.',
            },
            {
              kind: 'dont',
              text: 'Ask for an OTP longer than needed; 4–6 digits is standard and keeps entry quick.',
            },
            {
              kind: 'dont',
              text: 'Leave an expired code editable — disable it and make requesting a new code the obvious next step.',
            },
          ]}
        />
      </div>
    </div>
  );
}
