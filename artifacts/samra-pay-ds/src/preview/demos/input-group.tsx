import { AtSign, DollarSign, Search, Send } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '../../components/ui/input-group';
import { Kbd } from '../../components/ui/kbd';
import { Guidelines, Stack } from '../parts';

export function InputGroupDemo() {
  return (
    <div className="max-w-lg space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Search recipients">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search Selam, Dawit, Hanna…" />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </Stack>

      <Stack label="Amount with currency">
        <InputGroup>
          <InputGroupAddon>
            <DollarSign />
          </InputGroupAddon>
          <InputGroupInput
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue="200"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>USD</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Stack>

      <Stack label="Handle — with button">
        <InputGroup>
          <InputGroupAddon>
            <AtSign />
          </InputGroupAddon>
          <InputGroupInput placeholder="samra.pay/username" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="sm">Check</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Stack>

      <Stack label="Invalid — account number">
        <InputGroup>
          <InputGroupInput
            aria-invalid="true"
            defaultValue="1000"
            placeholder="Recipient account number"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>CBE</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-sm text-destructive" role="alert">
          Account numbers are 13 digits.
        </p>
      </Stack>

      <Stack label="Disabled — locked field">
        <InputGroup>
          <InputGroupAddon>
            <DollarSign />
          </InputGroupAddon>
          <InputGroupInput placeholder="Daily limit" defaultValue="2000" disabled />
          <InputGroupAddon align="inline-end">
            <InputGroupText>USD / day</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Stack>

      <Stack label="Multiline action — note to recipient">
        <InputGroup>
          <InputGroupTextarea placeholder="Add a message for Selam" />
          <InputGroupAddon align="block-end" className="justify-between">
            <InputGroupText>Markdown supported</InputGroupText>
            <InputGroupButton size="icon-xs" aria-label="Send note">
              <Send />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use addons to give a field context — a currency code, an @ prefix, or a search icon.',
            },
            {
              kind: 'do',
              text: 'Keep inline buttons short (“Check”, “Send”) so they never crowd the value being typed.',
            },
            {
              kind: 'dont',
              text: 'Stack more than one action inside a single group; move extra actions below the field.',
            },
            {
              kind: 'dont',
              text: 'Bury validation in the addon — show the error as its own line beneath the group.',
            },
          ]}
        />
      </div>
    </div>
  );
}
