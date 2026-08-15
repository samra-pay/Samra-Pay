import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Guidelines } from '../parts';

type Transfer = {
  id: string;
  recipient: string;
  destination: string;
  sent: string;
  received: string;
  status: 'Delivered' | 'In transit' | 'Failed';
};

const transfers: Transfer[] = [
  {
    id: 'TX-4821',
    recipient: 'Selam Tesfaye',
    destination: 'Addis Ababa',
    sent: '$120.00',
    received: 'Br 15,240',
    status: 'Delivered',
  },
  {
    id: 'TX-4820',
    recipient: 'Dawit Bekele',
    destination: 'Bahir Dar',
    sent: '$75.00',
    received: 'Br 9,525',
    status: 'In transit',
  },
  {
    id: 'TX-4818',
    recipient: 'Hanna Girma',
    destination: 'Hawassa',
    sent: '$200.00',
    received: 'Br 25,400',
    status: 'Delivered',
  },
  {
    id: 'TX-4815',
    recipient: 'Yonas Alemu',
    destination: 'Mekelle',
    sent: '$50.00',
    received: '—',
    status: 'Failed',
  },
];

function StatusBadge({ status }: { status: Transfer['status'] }) {
  if (status === 'Delivered') {
    return (
      <Badge className="bg-eucalyptus text-eucalyptus-foreground">
        Delivered
      </Badge>
    );
  }
  if (status === 'In transit') {
    return <Badge variant="secondary">In transit</Badge>;
  }
  return <Badge variant="destructive">Failed</Badge>;
}

export function TableDemo() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
        <Table>
          <TableCaption>
            Illustrative transfer history — figures are for demo purposes only.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent (USD)</TableHead>
              <TableHead className="text-right">Received (ETB)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((transfer) => (
              <TableRow key={transfer.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {transfer.id}
                </TableCell>
                <TableCell className="font-medium">
                  {transfer.recipient}
                </TableCell>
                <TableCell>{transfer.destination}</TableCell>
                <TableCell>
                  <StatusBadge status={transfer.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {transfer.sent}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {transfer.received}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total sent this month</TableCell>
              <TableCell className="text-right tabular-nums">$445.00</TableCell>
              <TableCell className="text-right tabular-nums">Br 50,165</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="max-w-3xl rounded-xl border bg-card p-6 text-card-foreground">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Empty state
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead className="text-right">Sent (USD)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={3}
                className="h-24 text-center text-muted-foreground"
              >
                No transfers yet — your first send will appear here.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Right-align monetary columns and use tabular figures so amounts scan cleanly down the column.',
            },
            {
              kind: 'do',
              text: 'Encode transfer status with a badge colour, not colour alone — keep the text label for accessibility.',
            },
            {
              kind: 'dont',
              text: 'Hide critical outcomes like failed transfers inside a row menu; surface them directly in the status column.',
            },
            {
              kind: 'dont',
              text: 'Leave a blank grid for an empty history — always render a full-width message so users know nothing broke.',
            },
          ]}
        />
      </div>
    </div>
  );
}
