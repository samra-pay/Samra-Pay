import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { Guidelines } from '../parts';

export function AccordionDemo() {
  return (
    <div className="space-y-6">
      <div className="max-w-lg space-y-4 rounded-xl border bg-card px-6 py-2 text-card-foreground">
        <Accordion type="single" collapsible defaultValue="fees">
          <AccordionItem value="fees">
            <AccordionTrigger>
              How much does it cost to send money to Ethiopia?
            </AccordionTrigger>
            <AccordionContent>
              Samra Pay shows a single upfront fee and the exact Birr amount
              your recipient receives before you confirm. Figures shown in this
              demo are illustrative only.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="speed">
            <AccordionTrigger>How fast do transfers arrive?</AccordionTrigger>
            <AccordionContent>
              Most transfers to Addis Ababa land within minutes. Bank deposits
              to other regions may take up to one business day.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="recipients">
            <AccordionTrigger>
              Can I save recipients like Selam or Dawit?
            </AccordionTrigger>
            <AccordionContent>
              Yes. Saved recipients appear in your address book so repeat
              transfers take just a couple of taps.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="max-w-lg space-y-2 rounded-xl border bg-card px-6 py-2 text-card-foreground">
        <p className="pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Multiple — several sections open at once
        </p>
        <Accordion type="multiple" defaultValue={['limits']}>
          <AccordionItem value="limits">
            <AccordionTrigger>Sending limits</AccordionTrigger>
            <AccordionContent>
              Verified accounts can send higher amounts per day. Limits are
              displayed on the send screen.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="support">
            <AccordionTrigger>Support</AccordionTrigger>
            <AccordionContent>
              Reach the diaspora support team in Amharic or English, any day of
              the week.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <p className="text-xs text-muted-foreground">
        Triggers are keyboard operable: focus and press Enter or Space to
        toggle; arrow keys move between headers.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use accordions for FAQs and secondary detail that most people can skip — like fee breakdowns or limits.',
            },
            {
              kind: 'do',
              text: 'Write trigger labels as the question or outcome, so the closed state still tells users what is inside.',
            },
            {
              kind: 'dont',
              text: 'Bury the primary send-money flow or a required step inside an accordion; keep critical actions always visible.',
            },
            {
              kind: 'dont',
              text: 'Nest accordions more than one level deep — it makes transfer information hard to scan.',
            },
          ]}
        />
      </div>
    </div>
  );
}
