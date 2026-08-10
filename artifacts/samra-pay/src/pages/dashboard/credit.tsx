import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { 
  LineChart, 
  Line, 
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

const creditScoreData = [
  { month: 'Jan', score: 710 },
  { month: 'Feb', score: 715 },
  { month: 'Mar', score: 722 },
  { month: 'Apr', score: 728 },
  { month: 'May', score: 735 },
  { month: 'Jun', score: 745 },
];

export function DashboardCredit() {
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif">Credit Health</h1>
          <p className="text-muted-foreground mt-1">Track your progress toward your American dream.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-card/50 border-white/5 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                FICO® Score 8
                <TrendingUp className="w-5 h-5 text-green-400" />
              </CardTitle>
              <CardDescription>Updated 2 days ago</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 mb-8">
                <span className="text-6xl font-serif text-primary">745</span>
                <span className="text-lg text-green-400 font-medium mb-1">+12 points this month</span>
              </div>
              <div className="h-[250px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={creditScoreData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--primary))' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card/50 border-white/5">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-2">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-sm font-medium text-green-400 bg-green-500/10 px-2 py-1 rounded">Excellent</span>
                </div>
                <div className="text-3xl font-mono mt-4">100%</div>
                <div className="text-sm font-medium mt-1">Payment History</div>
                <div className="text-xs text-muted-foreground mt-2">14 on-time payments. 0 missed.</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-white/5">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-1 rounded">Good</span>
                </div>
                <div className="text-3xl font-mono mt-4">18%</div>
                <div className="text-sm font-medium mt-1">Credit Utilization</div>
                <div className="text-xs text-muted-foreground mt-2">Below the 30% recommended target.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}