import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Toaster } from '../../components/ui/sonner';
import { Guidelines, Row } from '../parts';

// The design-system preview shell does not mount a global Toaster, so this
// demo renders its own so the triggers below actually surface a notification.
export function SonnerDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Types">
        <Button
          variant="gold"
          onClick={() => toast.success('Money sent to Selam Bekele')}
        >
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error('Transfer to Dawit failed', {
              description: 'No funds left your account. Please try again.',
            })
          }
        >
          Error
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.info('New exchange rate available', {
              description: '1 USD ≈ 59.6 ETB (illustrative).',
            })
          }
        >
          Info
        </Button>
      </Row>

      <Row label="With description and action">
        <Button
          onClick={() =>
            toast('Recipient added', {
              description: 'Hanna Girma is now in your address book.',
              action: { label: 'Undo', onClick: () => undefined },
            })
          }
        >
          With action
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast('Bill scheduled', {
              description: 'Ethio Telecom — 400 ETB on Aug 14, 2026.',
              action: { label: 'View', onClick: () => undefined },
            })
          }
        >
          Scheduled
        </Button>
      </Row>

      <Row label="Loading → resolved (promise)">
        <Button
          variant="gold"
          onClick={() => {
            const transfer = new Promise<void>((resolve) =>
              setTimeout(resolve, 1600),
            );
            toast.promise(transfer, {
              loading: 'Sending 250.00 USD to Selam…',
              success: 'Transfer complete — Selam will be notified.',
              error: 'Transfer could not be completed.',
            });
          }}
        >
          Send with progress
        </Button>
      </Row>

      <p className="text-xs text-muted-foreground">
        Toasts appear briefly and auto-dismiss; the promise toast shows a loading
        state, then resolves to success on its own.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use toasts for lightweight, momentary feedback — "Money sent", "Recipient added" — that doesn\'t need a response.',
            },
            {
              kind: 'do',
              text: 'Include an Undo action for reversible changes so people can recover from a mistap.',
            },
            {
              kind: 'dont',
              text: 'Put critical errors or required decisions in a toast — it disappears; use an alert or dialog for anything that blocks the flow.',
            },
          ]}
        />
      </div>

      <Toaster />
    </div>
  );
}
