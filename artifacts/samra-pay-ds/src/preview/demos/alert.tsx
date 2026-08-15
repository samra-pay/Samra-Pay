import {
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../components/ui/alert';
import { Guidelines, Stack } from '../parts';

export function AlertDemo() {
  return (
    <div className="max-w-xl space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Variants">
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Transfer complete</AlertTitle>
          <AlertDescription>
            You sent 250.00 USD to Selam Bekele. She'll receive about 14,900 ETB
            (illustrative rate).
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Transfer failed</AlertTitle>
          <AlertDescription>
            We couldn't reach Dawit's bank. No funds have left your account — try
            again in a few minutes.
          </AlertDescription>
        </Alert>
      </Stack>

      <Stack label="Informational — neutral context">
        <Alert>
          <Info />
          <AlertTitle>Verify your recipient</AlertTitle>
          <AlertDescription>
            First transfers to a new recipient may take up to 1 business day
            while we confirm the account details.
          </AlertDescription>
        </Alert>
        <Alert>
          <TrendingUp />
          <AlertTitle>Savings goal on track</AlertTitle>
          <AlertDescription>
            You've set aside 60% toward Hanna's tuition. Keep it up to reach your
            goal by the target date.
          </AlertDescription>
        </Alert>
      </Stack>

      <Stack label="Security — high-severity destructive">
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Action needed to keep sending</AlertTitle>
          <AlertDescription>
            Your ID document has expired. Update it to continue sending money
            abroad.
          </AlertDescription>
        </Alert>
      </Stack>

      <Stack label="Title only — compact">
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Bill scheduled for Aug 14, 2026</AlertTitle>
        </Alert>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use the default variant for confirmations and neutral context; reserve destructive for errors and security-critical warnings.',
            },
            {
              kind: 'do',
              text: 'Lead with a clear title, then explain what happened and what the person should do next.',
            },
            {
              kind: 'dont',
              text: 'Stack more than one destructive alert in view — repeated red erodes urgency and alarms people over routine issues.',
            },
            {
              kind: 'dont',
              text: 'Use an alert for transient success like "Saved" — a toast is less disruptive for momentary feedback.',
            },
          ]}
        />
      </div>
    </div>
  );
}
