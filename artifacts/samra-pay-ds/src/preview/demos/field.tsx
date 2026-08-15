import { Checkbox } from '../../components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Guidelines } from '../parts';

export function FieldDemo() {
  return (
    <div className="max-w-lg space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <FieldSet>
        <FieldLegend>Recipient details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="field-name">Full name</FieldLabel>
            <Input id="field-name" defaultValue="Selam Tesfaye" />
            <FieldDescription>
              Must match the name on the receiving account.
            </FieldDescription>
          </Field>

          <Field data-invalid="true">
            <FieldLabel htmlFor="field-account">Account number</FieldLabel>
            <Input id="field-account" defaultValue="1000" aria-invalid="true" />
            <FieldError>CBE account numbers are 13 digits.</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="field-amount">Amount (USD)</FieldLabel>
            <Input
              id="field-amount"
              type="number"
              inputMode="decimal"
              defaultValue="200"
            />
            <FieldDescription>
              Selam receives an illustrative ~26,000 ETB.
            </FieldDescription>
          </Field>

          <FieldSeparator>Preferences</FieldSeparator>

          <Field orientation="horizontal">
            <Checkbox
              id="field-save"
              aria-labelledby="field-save-title"
              defaultChecked
            />
            <FieldContent>
              <FieldTitle id="field-save-title">Save this recipient</FieldTitle>
              <FieldDescription>
                Keep Selam in your address book for next time.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="horizontal" data-disabled="true">
            <Checkbox id="field-express" disabled />
            <FieldContent>
              <FieldTitle>Express payout</FieldTitle>
              <FieldDescription>
                Unavailable for this payout method.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use Field to bind a label, control, and helper text into one accessible, evenly-spaced unit.',
            },
            {
              kind: 'do',
              text: 'Switch to horizontal orientation for toggles and checkboxes so the control sits beside its explanation.',
            },
            {
              kind: 'dont',
              text: 'Show both a description and an error at once — swap the helper text for the error when invalid.',
            },
            {
              kind: 'dont',
              text: 'Group unrelated inputs in one FieldSet; a legend should describe everything beneath it.',
            },
          ]}
        />
      </div>
    </div>
  );
}
