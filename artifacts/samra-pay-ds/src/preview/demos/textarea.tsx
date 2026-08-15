import { useState } from 'react';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Guidelines, Stack } from '../parts';

const MAX = 140;

export function TextareaDemo() {
  const [note, setNote] = useState('For Mom’s medicine and the electric bill.');

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Transfer note">
        <Label htmlFor="textarea-note">Note to Selam (optional)</Label>
        <Textarea
          id="textarea-note"
          placeholder="Add a short message for the recipient"
          value={note}
          maxLength={MAX}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="text-right text-xs text-muted-foreground">
          {note.length}/{MAX}
        </p>
      </Stack>

      <Stack label="States">
        <div className="space-y-2">
          <Label htmlFor="textarea-readonly">Confirmation receipt</Label>
          <Textarea
            id="textarea-readonly"
            readOnly
            value={
              'Sent $200.00 USD to Dawit Bekele on Aug 14, 2026.\nRef: SP-2026-0814-DB'
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="textarea-disabled">Support reply (locked)</Label>
          <Textarea
            id="textarea-disabled"
            placeholder="This ticket is closed"
            disabled
          />
        </div>
      </Stack>

      <Stack label="Invalid — required reason">
        <Label htmlFor="textarea-reason">Reason for large transfer</Label>
        <Textarea
          id="textarea-reason"
          aria-invalid="true"
          aria-describedby="textarea-reason-error"
          placeholder="Tell us why you’re sending this amount"
        />
        <p
          id="textarea-reason-error"
          className="text-sm text-destructive"
          role="alert"
        >
          A reason is required for transfers over $1,000.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a textarea for free-form, multi-line input such as a transfer note or support message.',
            },
            {
              kind: 'do',
              text: 'Show a character counter whenever there is a limit so the customer never gets cut off mid-thought.',
            },
            {
              kind: 'dont',
              text: 'Use a textarea for single values like an amount or account number — a single-line input fits better.',
            },
            {
              kind: 'dont',
              text: 'Force a note to be long; keep optional fields clearly optional so sending stays fast.',
            },
          ]}
        />
      </div>
    </div>
  );
}
