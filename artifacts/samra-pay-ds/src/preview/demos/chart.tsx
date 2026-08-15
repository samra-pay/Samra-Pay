import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartConfig } from '../../components/ui/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../../components/ui/chart';
import { Guidelines, Stack } from '../parts';

// chart-2 = eucalyptus, chart-3 = berbere, chart-4 = coffee (cultural tokens).
const volumeConfig = {
  addis: { label: 'Addis Ababa', color: 'var(--color-chart-2)' },
  bahirDar: { label: 'Bahir Dar', color: 'var(--color-chart-3)' },
  hawassa: { label: 'Hawassa', color: 'var(--color-chart-4)' },
} satisfies ChartConfig;

const volumeData = [
  { month: 'Jan', addis: 420, bahirDar: 180, hawassa: 120 },
  { month: 'Feb', addis: 510, bahirDar: 220, hawassa: 160 },
  { month: 'Mar', addis: 480, bahirDar: 260, hawassa: 190 },
  { month: 'Apr', addis: 620, bahirDar: 300, hawassa: 210 },
  { month: 'May', addis: 700, bahirDar: 340, hawassa: 260 },
  { month: 'Jun', addis: 660, bahirDar: 380, hawassa: 300 },
];

const totalConfig = {
  volume: { label: 'Total sent (USD)', color: 'var(--color-chart-1)' },
} satisfies ChartConfig;

const totalData = [
  { month: 'Jan', volume: 720 },
  { month: 'Feb', volume: 890 },
  { month: 'Mar', volume: 930 },
  { month: 'Apr', volume: 1130 },
  { month: 'May', volume: 1300 },
  { month: 'Jun', volume: 1340 },
];

export function ChartDemo() {
  return (
    <div className="space-y-6">
      <Stack label="Grouped bars — transfer volume by destination">
        <div className="max-w-2xl rounded-xl border bg-card p-6 text-card-foreground">
          <div className="mb-4">
            <p className="font-medium">Transfers to Ethiopia</p>
            <p className="text-sm text-muted-foreground">
              Illustrative monthly volume by destination city (demo data).
            </p>
          </div>
          <ChartContainer config={volumeConfig} className="max-h-72 w-full">
            <BarChart data={volumeData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="addis" fill="var(--color-addis)" radius={4} />
              <Bar dataKey="bahirDar" fill="var(--color-bahirDar)" radius={4} />
              <Bar dataKey="hawassa" fill="var(--color-hawassa)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
      </Stack>

      <Stack label="Area — total sent over time">
        <div className="max-w-2xl rounded-xl border bg-card p-6 text-card-foreground">
          <div className="mb-4">
            <p className="font-medium">Total sent (USD)</p>
            <p className="text-sm text-muted-foreground">
              Illustrative six-month trend across all recipients.
            </p>
          </div>
          <ChartContainer config={totalConfig} className="max-h-64 w-full">
            <AreaChart data={totalData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <ChartTooltip
                content={<ChartTooltipContent indicator="line" />}
              />
              <defs>
                <linearGradient id="fillVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-volume)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-volume)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <Area
                dataKey="volume"
                type="natural"
                stroke="var(--color-volume)"
                fill="url(#fillVolume)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Drive series colours from chart tokens (chart-1..5) so charts stay on-brand in dark and light modes.',
            },
            {
              kind: 'do',
              text: 'Give every chart a plain-language title and a config-driven legend so series are self-explanatory.',
            },
            {
              kind: 'dont',
              text: 'Present demo volumes as real figures — always label illustrative data as such.',
            },
            {
              kind: 'dont',
              text: 'Pack more than four or five series into one chart; split them before the palette runs out of distinct tokens.',
            },
          ]}
        />
      </div>
    </div>
  );
}
