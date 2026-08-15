import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/ui/form';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Guidelines } from '../parts';

const transferSchema = z.object({
  recipient: z.string().min(2, 'Enter the recipient’s full name.'),
  method: z.string().min(1, 'Choose a payout method.'),
  amount: z.coerce
    .number({ invalid_type_error: 'Enter an amount.' })
    .positive('Amount must be greater than zero.')
    .max(2000, 'Daily send limit is $2,000.'),
});

type TransferForm = z.infer<typeof transferSchema>;

export function FormDemo() {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<TransferForm>({
    resolver: zodResolver(transferSchema),
    defaultValues: { recipient: 'Selam Tesfaye', method: '', amount: 200 },
  });

  function onSubmit(values: TransferForm) {
    setSending(true);
    // Illustrative: mark the transfer as sent without any network call.
    setSentTo(values.recipient);
    setSending(false);
  }

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Form {...form}>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="recipient"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recipient</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Dawit Bekele" {...field} />
                </FormControl>
                <FormDescription>
                  Must match the name on the receiving account.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payout method</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose how Selam gets paid" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="bank">Bank deposit (CBE)</SelectItem>
                    <SelectItem value="wallet">Telebirr wallet</SelectItem>
                    <SelectItem value="cash">Cash pickup</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (USD)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Illustrative rate ~130 ETB per USD.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {sentTo ? (
            <p className="text-sm text-eucalyptus" role="status">
              Transfer to {sentTo} confirmed (demo).
            </p>
          ) : null}

          <Button type="submit" variant="gold" disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="animate-spin" /> Sending…
              </>
            ) : (
              'Send money'
            )}
          </Button>
        </form>
      </Form>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Validate on submit and show each error beside its own field so fixes are obvious.',
            },
            {
              kind: 'do',
              text: 'Keep helper text and error messages in the same slot — the message replaces the hint when invalid.',
            },
            {
              kind: 'dont',
              text: 'Disable the submit button just because the form is untouched; let validation guide the customer instead.',
            },
            {
              kind: 'dont',
              text: 'Bury money-movement errors at the top of the form — anchor them to the field that caused them.',
            },
          ]}
        />
      </div>
    </div>
  );
}
