import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';
import { Guidelines } from '../parts';

export function ContextMenuDemo() {
  const [pinned, setPinned] = useState(true);
  const [category, setCategory] = useState('family');

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recipient card · right-click for actions
      </p>
      <ContextMenu>
        <ContextMenuTrigger className="flex h-40 max-w-lg flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-background text-sm text-muted-foreground">
          <span className="text-base font-medium text-foreground">
            Dawit Alemu
          </span>
          <span>Addis Ababa · CBE ···4821</span>
          <span className="text-xs">Right-click to manage recipient</span>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Dawit Alemu</ContextMenuLabel>
          <ContextMenuItem>
            Send money <ContextMenuShortcut>Cmd S</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>Repeat last transfer</ContextMenuItem>
          <ContextMenuItem>Edit details</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={pinned}
            onCheckedChange={(checked) => setPinned(checked === true)}
          >
            Pin to favorites
          </ContextMenuCheckboxItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Category</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup
                value={category}
                onValueChange={setCategory}
              >
                <ContextMenuRadioItem value="family">
                  Family
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="business">
                  Business
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="bills">Bills</ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem disabled>Merge duplicate (none found)</ContextMenuItem>
          <ContextMenuItem className="text-destructive focus:text-destructive">
            Remove recipient
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use context menus for secondary shortcuts on a recipient or transaction row — the same actions must also be reachable by button.',
            },
            {
              kind: 'do',
              text: 'Mark destructive actions like "Remove recipient" with destructive color and place them last.',
            },
            {
              kind: 'dont',
              text: 'Hide the only path to a critical action behind right-click; touch users on mobile cannot discover it.',
            },
          ]}
        />
      </div>
    </div>
  );
}
