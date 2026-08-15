import { Building2, Loader2, MoreHorizontal, Send, Zap } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '../../components/ui/item';
import { Skeleton } from '../../components/ui/skeleton';
import { Guidelines, Stack } from '../parts';

export function ItemDemo() {
  return (
    <div className="space-y-6">
      <Stack label="Recipient list">
        <ItemGroup className="max-w-xl rounded-xl border bg-card p-2 text-card-foreground">
          <Item variant="muted">
            <ItemHeader>
              <span className="text-xs text-muted-foreground">
                Last sent 2 days ago
              </span>
              <span className="text-xs text-muted-foreground">Favourite</span>
            </ItemHeader>
            <ItemMedia>
              <Avatar>
                <AvatarFallback>ST</AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Selam Tesfaye</ItemTitle>
              <ItemDescription>
                Commercial Bank of Ethiopia • Addis Ababa
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="gold" size="sm">
                <Send /> Send
              </Button>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </ItemActions>
            <ItemFooter>
              <span className="text-xs text-muted-foreground">
                Typically delivered in minutes
              </span>
            </ItemFooter>
          </Item>
          <ItemSeparator />
          <Item variant="outline">
            <ItemMedia variant="icon">
              <Building2 />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Dawit Bekele</ItemTitle>
              <ItemDescription>Awash Bank • Bahir Dar</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm">
                <Send /> Send
              </Button>
            </ItemActions>
          </Item>
        </ItemGroup>
      </Stack>

      <Stack label="States">
        <ItemGroup className="max-w-xl rounded-xl border bg-card p-2 text-card-foreground">
          <Item size="sm">
            <ItemMedia variant="icon">
              <Zap />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Auto-savings pocket</ItemTitle>
              <ItemDescription>School fees • Br 5,000 goal</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" disabled>
                Paused
              </Button>
            </ItemActions>
          </Item>
          <ItemSeparator />
          <Item size="sm">
            <ItemMedia variant="icon">
              <Loader2 className="animate-spin" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Transfer to Hanna Girma</ItemTitle>
              <ItemDescription>Processing — do not close the app</ItemDescription>
            </ItemContent>
          </Item>
          <ItemSeparator />
          <Item size="sm">
            <ItemMedia variant="icon">
              <Skeleton className="size-4 rounded-full" />
            </ItemMedia>
            <ItemContent>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </ItemContent>
          </Item>
        </ItemGroup>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Lead each recipient with an avatar or bank icon so the list is scannable at a glance.',
            },
            {
              kind: 'do',
              text: 'Keep the primary action ("Send") in the actions slot and push extras into the overflow menu.',
            },
            {
              kind: 'dont',
              text: 'Crowd an item with more than one prominent action — reserve gold for the single primary send.',
            },
            {
              kind: 'dont',
              text: 'Show empty item rows while loading; use skeleton media and text so the layout stays stable.',
            },
          ]}
        />
      </div>
    </div>
  );
}
