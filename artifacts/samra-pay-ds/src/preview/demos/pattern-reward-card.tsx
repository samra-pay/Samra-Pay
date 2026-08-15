import { Gift } from 'lucide-react';
import { RewardCard } from '../../components/patterns/reward-card';
import { Guidelines, Stack } from '../parts';

export function PatternRewardCardDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Full — balance, tier, goal progress, and action">
        <div className="max-w-2xl">
          <RewardCard
            programName="ShebaMiles Rewards"
            points="42,500"
            unit="miles"
            tier="Gold"
            earnedNote="+1,240 earned this month"
            goalLabel="Round trip to Addis"
            goalPercent={85}
            goalCeilingLabel="50,000 miles"
            action={{ label: 'Redeem miles in the Rewards hub' }}
          />
        </div>
      </Stack>

      <Stack label="Compact — balance + tier only">
        <div className="max-w-md">
          <RewardCard programName="Samra Cashback" points="1,860" unit="birr" tier="Silver" />
        </div>
      </Stack>

      <Stack label="Custom icon + action">
        <div className="max-w-md">
          <RewardCard
            programName="Referral Bonus"
            points="6"
            unit="invites"
            tier="Member"
            earnedNote="+2 this week"
            icon={<Gift className="h-52 w-52 rotate-12" />}
            action={{ label: 'Invite Dawit Assefa' }}
          />
        </div>
      </Stack>

      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Trust language:</span> every card carries an
        "Illustrative demo reward" microcopy line near the balance. The goal bar exposes{' '}
        <code>role="progressbar"</code> with value/min/max. The ambient icon drift respects reduced
        motion. Panels are token-driven (eucalyptus surface, gold accents) and read in both modes.
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use the gold-stripe reward card to spotlight a loyalty balance at the top of a dashboard.' },
            { kind: 'do', text: 'Keep the "Illustrative demo reward" line visible so demo figures are never mistaken for real balances.' },
            { kind: 'dont', text: 'Stack multiple full reward cards side by side — one gold spotlight per view keeps the hierarchy.' },
            { kind: 'dont', text: 'Override the eucalyptus/gold surface with hard-coded colors; let the tokens carry light/dark.' },
          ]}
        />
      </div>
    </div>
  );
}
