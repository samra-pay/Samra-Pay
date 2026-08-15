import { Command } from 'lucide-react';
import { Kbd, KbdGroup } from '../../components/ui/kbd';
import { Guidelines, Row, Stack } from '../parts';

export function KbdDemo() {
  return (
    <div className="space-y-6">
      <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
        <Row label="Single keys">
          <Kbd>Esc</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd>Tab</Kbd>
          <Kbd>?</Kbd>
        </Row>

        <Row label="Shortcut combinations">
          <KbdGroup>
            <Kbd>
              <Command />
            </Kbd>
            <span>+</span>
            <Kbd>K</Kbd>
          </KbdGroup>
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>Enter</Kbd>
          </KbdGroup>
        </Row>

        <Stack label="In context">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Press
            <KbdGroup>
              <Kbd>
                <Command />
              </Kbd>
              <span>+</span>
              <Kbd>K</Kbd>
            </KbdGroup>
            to search recipients like Selam or Dawit.
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Confirm a transfer with
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <span>+</span>
              <Kbd>Enter</Kbd>
            </KbdGroup>
          </p>
        </Stack>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use Kbd to teach the exact keys for real shortcuts — search, confirm send — not decorative labels.',
            },
            {
              kind: 'do',
              text: 'Group modifier and key with KbdGroup so a combination reads as one gesture.',
            },
            {
              kind: 'dont',
              text: 'Show desktop keyboard hints on the mobile Send screen, where there is no keyboard to press.',
            },
          ]}
        />
      </div>
    </div>
  );
}
