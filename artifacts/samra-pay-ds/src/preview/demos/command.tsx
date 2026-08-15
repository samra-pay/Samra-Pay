import {
  ArrowLeftRight,
  Receipt,
  Repeat2,
  Send,
  Settings,
  Smartphone,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '../../components/ui/command';
import { Guidelines, Stack } from '../parts';

export function CommandDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Command palette — type to filter">
        <div className="max-w-md overflow-hidden rounded-xl border shadow-sm">
          <Command>
            <CommandInput placeholder="Search actions, recipients, bills…" />
            <CommandList>
              <CommandEmpty>No matches found.</CommandEmpty>
              <CommandGroup heading="Actions">
                <CommandItem>
                  <Send /> Send money
                  <CommandShortcut>⌘S</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <Repeat2 /> Repeat last transfer
                  <CommandShortcut>⌘R</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <ArrowLeftRight /> Convert USD → ETB
                </CommandItem>
                <CommandItem>
                  <UserPlus /> Add recipient
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Recipients">
                <CommandItem>
                  <Send /> Send to Selam Girma
                </CommandItem>
                <CommandItem>
                  <Send /> Send to Dawit Bekele
                </CommandItem>
                <CommandItem>
                  <Send /> Send to Hanna Tesfaye
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Bills">
                <CommandItem>
                  <Zap /> Pay electricity
                </CommandItem>
                <CommandItem>
                  <Smartphone /> Top up airtime
                </CommandItem>
                <CommandItem>
                  <Receipt /> View statement
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">
                <CommandItem disabled>
                  <Settings /> Manage limits (verify identity first)
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Stack>

      <Stack label="Empty state">
        <div className="max-w-md overflow-hidden rounded-xl border shadow-sm">
          <Command>
            <CommandInput placeholder="Search actions, recipients, bills…" />
            <CommandList>
              <CommandEmpty>
                No matches. Try a name like “Selam” or an action like “Send”.
              </CommandEmpty>
              <CommandGroup heading="Actions">
                <CommandItem>
                  <Send /> Send money
                  <CommandShortcut>⌘S</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Stack>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          Arrow keys move the highlight, Enter runs the item, and typing filters
          live — the search input holds focus throughout.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Group palette items by intent — Actions, Recipients, Bills — so results stay scannable as they filter.',
            },
            {
              kind: 'do',
              text: 'Surface shortcuts for the actions people repeat most, like Send and Repeat transfer.',
            },
            {
              kind: 'dont',
              text: 'Leave the empty state blank; suggest what to type so a no-match result still guides the user.',
            },
            {
              kind: 'dont',
              text: 'List disabled items without a reason — say why (e.g. “verify identity first”) or omit them.',
            },
          ]}
        />
      </div>
    </div>
  );
}
