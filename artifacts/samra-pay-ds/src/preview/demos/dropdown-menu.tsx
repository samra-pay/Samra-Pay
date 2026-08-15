import { useState } from 'react';
import {
  ArrowLeftRight,
  Copy,
  Download,
  MoreHorizontal,
  Repeat,
  Share2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Guidelines, Row } from '../parts';

export function DropdownMenuDemo() {
  const [showConverted, setShowConverted] = useState(true);
  const [payFrom, setPayFrom] = useState('usd-wallet');

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Transfer actions menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Transfer to Selam</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuLabel>Selam Bekele</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Repeat /> Repeat last transfer
                <DropdownMenuShortcut>Cmd R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ArrowLeftRight /> Schedule monthly
              </DropdownMenuItem>
              <DropdownMenuItem>
                <UserPlus /> Save as recipient
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showConverted}
              onCheckedChange={(checked) => setShowConverted(checked === true)}
            >
              Show ETB conversion
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Pay from</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={payFrom}
                  onValueChange={setPayFrom}
                >
                  <DropdownMenuRadioItem value="usd-wallet">
                    USD wallet
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="savings">
                    Savings
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="linked-card">
                    Linked card
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <Trash2 /> Cancel transfer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>

      <Row label="Row overflow menu (icon trigger)">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Transfer options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>USD → ETB · $200.00</DropdownMenuLabel>
            <DropdownMenuItem>
              <Copy /> Copy reference
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download /> Download receipt
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Share2 /> Share status
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Dispute (settled)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-sm text-muted-foreground">
          Arrow keys move focus; Esc closes and returns focus to the trigger.
        </p>
      </Row>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Group related transfer actions and separate destructive items like "Cancel transfer" with a divider and destructive color.',
            },
            {
              kind: 'do',
              text: 'Use an icon trigger for per-row overflow actions in dense transaction lists.',
            },
            {
              kind: 'dont',
              text: 'Bury a primary action such as "Send Money" inside a dropdown — keep it a visible button.',
            },
            {
              kind: 'dont',
              text: 'Stack more than one level of submenus; deep nesting hides options money-sending users need quickly.',
            },
          ]}
        />
      </div>
    </div>
  );
}
