import { useState } from 'react';
import { ArrowUpRight, Send, Wallet } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
} from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Guidelines } from '../parts';

export function CardDemo() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-6">
      {/* Full anatomy: header (title + description), content, footer */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Send money to Ethiopia</CardTitle>
          <CardDescription>
            Transfers arrive in 1–2 business days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-2xl font-semibold">$200.00</p>
              <p className="text-sm text-muted-foreground">You send (USD)</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-2xl font-semibold">~26,000</p>
              <p className="text-sm text-muted-foreground">
                Selam gets (ETB)*
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            *Illustrative rate for demo purposes only.
          </p>
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="ghost">Edit</Button>
          <Button variant="gold">
            <Send /> Send Money
          </Button>
        </CardFooter>
      </Card>

      {/* Fintech balance card using cultural tokens */}
      <Card className="max-w-md bg-coffee text-coffee-foreground">
        <CardHeader>
          <CardDescription className="text-coffee-foreground/70">
            Available balance
          </CardDescription>
          <CardTitle className="text-3xl">$1,248.60</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-coffee-foreground/80">
          <Wallet className="size-4" />
          Samra Pay wallet · USD
        </CardContent>
        <CardFooter className="gap-3">
          <Button variant="secondary" size="sm">
            <ArrowUpRight /> Add money
          </Button>
          <Button variant="secondary" size="sm">
            <Send /> Send
          </Button>
        </CardFooter>
      </Card>

      {/* Interactive recipient card with actions */}
      <Card className="max-w-md">
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <Avatar>
            <AvatarFallback className="bg-eucalyptus text-eucalyptus-foreground">
              DB
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <CardTitle className="text-base">Dawit Bekele</CardTitle>
            <CardDescription>CBE · ****4821</CardDescription>
          </div>
        </CardHeader>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" size="sm">
            View history
          </Button>
          <Button variant="gold" size="sm">
            Send again
          </Button>
        </CardFooter>
      </Card>

      {/* Loading / empty skeleton card */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Recent transfers</CardTitle>
          <CardDescription>Loading your latest activity…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No transfers yet — send your first one to see it here.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLoading((value) => !value)}
          >
            {loading ? 'Show empty state' : 'Show loading state'}
          </Button>
        </CardFooter>
      </Card>

      <div className="max-w-md rounded-xl border bg-card p-6 text-card-foreground">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Give every card one clear job — a transfer, a balance, a recipient — and one primary action.',
            },
            {
              kind: 'do',
              text: 'Show a skeleton that matches the real layout while data loads, then swap to an empty state if there is nothing.',
            },
            {
              kind: 'dont',
              text: 'Stack multiple gold buttons in a footer; keep a single primary action and demote the rest.',
            },
            {
              kind: 'dont',
              text: 'Cram unrelated stats into one card — split distinct topics into separate cards for scannability.',
            },
          ]}
        />
      </div>
    </div>
  );
}
