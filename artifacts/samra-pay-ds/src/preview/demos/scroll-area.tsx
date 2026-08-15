import { ScrollArea, ScrollBar } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';
import { Guidelines, Stack } from '../parts';

const activity = [
  { name: 'Selam Tesfaye', amount: '$120.00', when: 'Today' },
  { name: 'Dawit Bekele', amount: '$75.00', when: 'Today' },
  { name: 'Hanna Girma', amount: '$200.00', when: 'Yesterday' },
  { name: 'Yonas Alemu', amount: '$50.00', when: 'Yesterday' },
  { name: 'Meron Haile', amount: '$90.00', when: 'This week' },
  { name: 'Abel Tadesse', amount: '$140.00', when: 'This week' },
  { name: 'Ruth Solomon', amount: '$60.00', when: 'This week' },
  { name: 'Kidus Fikru', amount: '$110.00', when: 'Last week' },
  { name: 'Bethel Assefa', amount: '$35.00', when: 'Last week' },
  { name: 'Nardos Girma', amount: '$185.00', when: 'Last week' },
];

const recipients = ['Selam', 'Dawit', 'Hanna', 'Yonas', 'Meron', 'Abel'];

export function ScrollAreaDemo() {
  return (
    <div className="space-y-6">
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Stack label="Vertical — transfer history">
          <ScrollArea className="h-56 rounded-xl border bg-card p-4 text-card-foreground">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent transfers
            </p>
            <div className="pr-4">
              {activity.map((row, index) => (
                <div key={row.name}>
                  {index > 0 ? <Separator className="my-2" /> : null}
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.when}</p>
                    </div>
                    <span className="tabular-nums">{row.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Stack>

        <Stack label="Horizontal — quick recipients">
          <ScrollArea className="w-full rounded-xl border bg-card p-4 text-card-foreground">
            <div className="flex w-max gap-3 pb-3">
              {recipients.map((name) => (
                <div
                  key={name}
                  className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-lg bg-muted p-3 text-sm font-medium"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/20 text-primary">
                    {name[0]}
                  </span>
                  {name}
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Stack>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Cap the height of long lists like transfer history so the surrounding layout stays predictable.',
            },
            {
              kind: 'do',
              text: 'Use a horizontal scroll row for a small carousel of quick recipients where each tile is equal weight.',
            },
            {
              kind: 'dont',
              text: 'Hide the only path to a required action below the fold of a scroll area.',
            },
          ]}
        />
      </div>
    </div>
  );
}
