import { useState } from 'react';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '../../components/ui/menubar';
import { Guidelines } from '../parts';

export function MenubarDemo() {
  const [showPending, setShowPending] = useState(true);
  const [currency, setCurrency] = useState('etb');

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Transfers console
      </p>
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>Transfer</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              New transfer <MenubarShortcut>Cmd N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Add recipient <MenubarShortcut>Cmd R</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>Bulk payout (Pro)</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem
              checked={showPending}
              onCheckedChange={(checked) => setShowPending(checked === true)}
            >
              Show pending transfers
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Display currency</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarRadioGroup value={currency} onValueChange={setCurrency}>
                  <MenubarRadioItem value="usd">USD</MenubarRadioItem>
                  <MenubarRadioItem value="etb">ETB</MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Transfer limits</MenubarItem>
            <MenubarItem>Contact support</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <p className="text-sm text-muted-foreground">
        Left/Right arrows move between menus; Up/Down move within an open menu.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Reserve the menubar for a dense desktop console such as an operations or transfers dashboard.',
            },
            {
              kind: 'do',
              text: 'Keep top-level menu labels to a short, predictable set (Transfer, View, Help).',
            },
            {
              kind: 'dont',
              text: 'Use a menubar on the consumer send-money flow; simple screens read better with plain buttons.',
            },
          ]}
        />
      </div>
    </div>
  );
}
