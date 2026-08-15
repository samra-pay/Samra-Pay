import { useEffect, useState } from 'react';
import { Progress } from '../../components/ui/progress';
import { Guidelines, Stack } from '../parts';

export function ProgressDemo() {
  // Deterministic animation loop: no random values, fixed start.
  const [value, setValue] = useState(12);

  useEffect(() => {
    const timer = setInterval(() => {
      setValue((current) => (current >= 100 ? 12 : current + 22));
    }, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Transfer status — determinate">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sending to Selam</span>
            <span className="font-medium tabular-nums">64%</span>
          </div>
          <Progress value={64} />
        </div>
      </Stack>

      <Stack label="Steps of a KYC review">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Identity verification</span>
            <span className="font-medium tabular-nums">2 of 4 steps</span>
          </div>
          <Progress value={50} />
        </div>
      </Stack>

      <Stack label="Complete">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Bill paid — Ethio Telecom</span>
            <span className="font-medium tabular-nums">100%</span>
          </div>
          <Progress value={100} />
        </div>
      </Stack>

      <Stack label="Waiting — not started">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Savings goal: Hanna's tuition</span>
            <span className="font-medium tabular-nums">0%</span>
          </div>
          <Progress value={0} />
        </div>
      </Stack>

      <Stack label="Live — updates deterministically">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uploading proof of funds</span>
            <span className="font-medium tabular-nums">{value}%</span>
          </div>
          <Progress value={value} />
        </div>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Pair the bar with a percentage or step count so people know exactly how much is left.',
            },
            {
              kind: 'do',
              text: 'Use progress for tasks with a known end — transfers, uploads, multi-step onboarding.',
            },
            {
              kind: 'dont',
              text: 'Use a determinate bar for waits of unknown length — a spinner communicates ongoing work without a false estimate.',
            },
          ]}
        />
      </div>
    </div>
  );
}
