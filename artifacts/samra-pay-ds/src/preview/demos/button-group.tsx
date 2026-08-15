import { useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  Copy,
  Loader2,
  Minus,
  Plus,
  Send,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '../../components/ui/button-group';
import { Input } from '../../components/ui/input';
import { Guidelines, Row, Stack } from '../parts';

export function ButtonGroupDemo() {
  const [amount, setAmount] = useState(500);

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Segmented — pick a transfer speed">
        <ButtonGroup>
          <Button variant="gold">Instant</Button>
          <Button variant="outline">Same day</Button>
          <Button variant="outline">Standard</Button>
        </ButtonGroup>
      </Row>

      <Row label="Split action — send with more options">
        <ButtonGroup>
          <Button variant="gold">
            <Send /> Send to Selam
          </Button>
          <Button variant="gold" size="icon" aria-label="More send options">
            <ChevronDown />
          </Button>
        </ButtonGroup>
      </Row>

      <Row label="Attached prefix — amount entry">
        <ButtonGroup>
          <ButtonGroupText>USD</ButtonGroupText>
          <Input
            aria-label="Amount to send"
            defaultValue="250.00"
            className="w-36"
          />
          <ButtonGroupText>≈ 31,250 ETB</ButtonGroupText>
        </ButtonGroup>
      </Row>

      <Row label="Stepper — adjust top-up amount">
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon"
            aria-label="Decrease amount"
            onClick={() => setAmount((v) => Math.max(0, v - 50))}
          >
            <Minus />
          </Button>
          <ButtonGroupText>{amount} ETB</ButtonGroupText>
          <Button
            variant="outline"
            size="icon"
            aria-label="Increase amount"
            onClick={() => setAmount((v) => v + 50)}
          >
            <Plus />
          </Button>
        </ButtonGroup>
      </Row>

      <Row label="Icon toolbar with separator">
        <ButtonGroup>
          <Button variant="outline" size="icon" aria-label="Swap currencies">
            <ArrowLeftRight />
          </Button>
          <ButtonGroupSeparator />
          <Button variant="outline" size="icon" aria-label="Copy details">
            <Copy />
          </Button>
        </ButtonGroup>
      </Row>

      <Row label="Vertical orientation">
        <ButtonGroup orientation="vertical" className="w-44">
          <Button variant="outline">Airtime</Button>
          <Button variant="outline">Electricity bill</Button>
          <Button variant="outline">Water bill</Button>
        </ButtonGroup>
      </Row>

      <Row label="States — disabled & loading">
        <ButtonGroup>
          <Button variant="gold" disabled>
            <Loader2 className="animate-spin" /> Confirming
          </Button>
          <Button variant="gold" size="icon" disabled aria-label="More options">
            <ChevronDown />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button variant="outline" disabled>
            Instant
          </Button>
          <Button variant="outline" disabled>
            Same day
          </Button>
        </ButtonGroup>
      </Row>

      <Stack label="Keyboard">
        <p className="text-sm text-muted-foreground">
          Tab moves between grouped buttons; the focused control lifts above its
          neighbours so the focus ring is never clipped by the shared border.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Group buttons that act on one object — a single transfer or one bill — so they read as one control.',
            },
            {
              kind: 'do',
              text: 'Reserve the split-button’s gold primary for the expected action and tuck rarer choices behind the caret.',
            },
            {
              kind: 'dont',
              text: 'Mix unrelated actions in one group; “Send” next to “Delete recipient” invites costly mistakes.',
            },
            {
              kind: 'dont',
              text: 'Stack more than one gold button inside a group — the emphasis stops meaning “primary”.',
            },
          ]}
        />
      </div>
    </div>
  );
}
