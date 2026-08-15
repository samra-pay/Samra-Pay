import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { Guidelines, Row, Stack } from '../parts';

export function SpinnerDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Sizes">
        <Spinner className="size-4" />
        <Spinner className="size-6" />
        <Spinner className="size-8" />
      </Row>

      <Row label="Inline with text">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Confirming your transfer to Dawit…
        </span>
      </Row>

      <Row label="Inside a button — pending action">
        <Button variant="gold" disabled>
          <Spinner /> Sending money
        </Button>
        <Button disabled>
          <Spinner /> Paying bill
        </Button>
        <Button variant="outline" disabled>
          <Spinner /> Verifying
        </Button>
      </Row>

      <Stack label="Centered — loading a panel">
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border py-10 text-muted-foreground">
          <Spinner className="size-6 text-primary" />
          <p className="text-sm">Loading exchange rates…</p>
        </div>
      </Stack>

      <p className="text-xs text-muted-foreground">
        The spinner carries <code className="text-foreground">role="status"</code>{' '}
        and an accessible “Loading” label, so screen readers announce the busy
        state without extra markup.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a spinner for short, indefinite waits where you can\'t estimate how long the task will take.',
            },
            {
              kind: 'do',
              text: 'Swap the button label to a present-tense verb ("Sending money") while the spinner shows, so intent stays clear.',
            },
            {
              kind: 'dont',
              text: 'Use a spinner for waits longer than a few seconds — a progress bar or skeleton sets better expectations.',
            },
          ]}
        />
      </div>
    </div>
  );
}
