import { CalendarClock, MapPin } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../../components/ui/hover-card';
import { Guidelines, Stack } from '../parts';

const lastSent = new Date(2026, 7, 14);
const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function RecipientHoverCard() {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="font-medium underline underline-offset-4"
        >
          Selam Girma
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 space-y-3">
        <div className="flex gap-3">
          <Avatar>
            <AvatarFallback>SG</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="font-medium">Selam Girma</p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> Addis Ababa, Ethiopia
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Delivery</span>
          <Badge variant="secondary">Bank · ETB</Badge>
        </div>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <CalendarClock className="size-3.5" /> Last sent{' '}
          {dateFmt.format(lastSent)}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function BusinessHoverCard() {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="font-medium underline underline-offset-4"
        >
          Ethio Electric
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 space-y-2">
        <p className="font-medium">Ethio Electric Utility</p>
        <p className="text-sm text-muted-foreground">
          Registered biller. Pay electricity bills directly in ETB — usually
          delivered within minutes. Figures are illustrative.
        </p>
        <Badge className="bg-eucalyptus text-eucalyptus-foreground">
          Verified biller
        </Badge>
      </HoverCardContent>
    </HoverCard>
  );
}

export function HoverCardDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Recipient preview">
        <p className="text-sm text-muted-foreground">
          Sending 250.00 USD to{' '}
          <RecipientHoverCard /> — hover the name for details.
        </p>
      </Stack>

      <Stack label="Verified biller preview">
        <p className="text-sm text-muted-foreground">
          Bill from <BusinessHoverCard /> is due this week.
        </p>
      </Stack>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          Hover cards open on pointer hover and on keyboard focus of the
          trigger, so the preview is reachable without a mouse.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a hover card to preview a recipient or biller inline, sparing a trip to a detail page.',
            },
            {
              kind: 'do',
              text: 'Keep the content glanceable — name, location, delivery, last activity — not a full profile.',
            },
            {
              kind: 'dont',
              text: 'Put buttons or inputs inside a hover card; it can vanish on pointer-out, so use a popover for actions.',
            },
            {
              kind: 'dont',
              text: 'Hide information a user needs to complete a task behind hover — it’s invisible on touch devices.',
            },
          ]}
        />
      </div>
    </div>
  );
}
