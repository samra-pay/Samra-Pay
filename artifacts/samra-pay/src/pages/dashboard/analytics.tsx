import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Coffee, Plane, ShoppingBag, Car } from "lucide-react";
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

const spendingOverTime = [
  { month: "Jan", amount: 2400 },
  { month: "Feb", amount: 1398 },
  { month: "Mar", amount: 4800 },
  { month: "Apr", amount: 3908 },
  { month: "May", amount: 4800 },
  { month: "Jun", amount: 3800 },
];

const categories = [
  { name: 'Travel', amount: 1820, percent: 45, icon: Plane, color: "hsl(var(--primary))" },
  { name: 'Dining', amount: 850, percent: 21, icon: Coffee, color: "hsl(var(--chart-2))" },
  { name: 'Shopping', amount: 620, percent: 15, icon: ShoppingBag, color: "hsl(var(--chart-3))" },
  { name: 'Transport', amount: 310, percent: 8, icon: Car, color: "hsl(var(--chart-4))" },
];

export function DashboardAnalytics() {
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif">Spending Analytics</h1>
          <p className="text-muted-foreground mt-1">Understand your financial habits across all accounts.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-card/50 border-white/5 lg:col-span-2">
            <CardHeader>
              <CardTitle>Spending Over Time</CardTitle>
              <CardDescription>Total outflow for the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendingOverTime} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number) => [`$${value}`, 'Spent']}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {spendingOverTime.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === spendingOverTime.length - 1 ? "hsl(var(--primary))" : "hsl(var(--muted))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>Top Categories</CardTitle>
              <CardDescription>This month's breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 mt-2">
                {categories.map((cat, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <cat.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{cat.name}</span>
                      </div>
                      <span className="font-mono text-sm">${cat.amount}</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-1000" 
                        style={{ width: `${cat.percent}%`, backgroundColor: cat.color }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}