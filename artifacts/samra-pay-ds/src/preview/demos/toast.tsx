import { Button } from '../../components/ui/button';
import { ToastAction } from '../../components/ui/toast';
import { Toaster } from '../../components/ui/toaster';
import { toast } from '../../hooks/use-toast';
import { Guidelines, Row } from '../parts';

// The design-system preview shell does not mount a global Toaster, so this
// demo renders its own so the triggers below actually surface a notification.
export function ToastDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Default — confirmation">
        <Button
          onClick={() =>
            toast({
              title: 'Money sent',
              description: '250.00 USD is on its way to Selam Bekele.',
            })
          }
        >
          Show toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({
              title: 'Recipient added',
              description: 'Hanna Girma is now in your address book.',
              action: <ToastAction altText="View recipient">View</ToastAction>,
            })
          }
        >
          With action
        </Button>
      </Row>

      <Row label="Destructive — error with retry">
        <Button
          variant="destructive"
          onClick={() =>
            toast({
              variant: 'destructive',
              title: 'Transfer failed',
              description: "We couldn't reach Dawit's bank. No funds were sent.",
              action: <ToastAction altText="Retry transfer">Retry</ToastAction>,
            })
          }
        >
          Show error
        </Button>
      </Row>

      <p className="text-xs text-muted-foreground">
        Toasts auto-dismiss and stack; each includes a close control reachable by
        keyboard for accessible dismissal.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use the default variant to confirm a completed action; reserve the destructive variant for failures.',
            },
            {
              kind: 'do',
              text: 'Offer a matching action — Retry on failure, View on success — so the toast is a shortcut, not just a notice.',
            },
            {
              kind: 'dont',
              text: 'Trigger a toast for every keystroke or minor state change; reserve them for outcomes worth interrupting for.',
            },
          ]}
        />
      </div>

      <Toaster />
    </div>
  );
}
