/**
 * recharts-compat.d.ts
 *
 * Recharts ships generic class components (e.g. `class XAxis<T>`) whose
 * `typeof XAxis` does not satisfy TypeScript's JSXElementConstructor constraint
 * (`new(props, context) => Component<any,any,any>`) when @types/react >= 19.
 *
 * This module augmentation re-declares the affected components as React.FC so
 * TypeScript accepts them in JSX without errors. The runtime behaviour is
 * unchanged — recharts still ships the real implementations.
 */
import type {
  XAxisProps,
  YAxisProps,
  TooltipProps,
  LegendProps,
  BarProps,
  LineProps,
} from 'recharts';

declare module 'recharts' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const XAxis: React.FC<XAxisProps>;
  export const YAxis: React.FC<YAxisProps>;
  // Tooltip is generic; use any for value/name here since we go through ChartTooltipContent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Tooltip: React.FC<TooltipProps<any, any>>;
  export const Legend: React.FC<LegendProps>;
  export const Bar: React.FC<BarProps>;
  export const Line: React.FC<LineProps>;
}
