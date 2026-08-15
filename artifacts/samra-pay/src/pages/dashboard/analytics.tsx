import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/samra-pay-ds/components/ui/card";
import { Coffee, Plane, ShoppingBag, Car, SendToBack, Globe } from "lucide-react";
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from "recharts";
import { motion } from "framer-motion";
import { cn } from "@workspace/samra-pay-ds/lib/utils";
import { MOCK_DATA } from "@/lib/mock-data";

const spendingOverTime = [
  { month: "Jan", spent: 2400, remitted: 300 },
  { month: "Feb", spent: 1398, remitted: 300 },
  { month: "Mar", spent: 4800, remitted: 450 },
  { month: "Apr", spent: 3908, remitted: 300 },
  { month: "May", spent: 4800, remitted: 0 },
  { month: "Jun", spent: 3800, remitted: 600 },
];

const categories = [
  { name: 'Sent Home', amount: 1950, percent: 35, icon: Globe, color: "hsl(var(--primary))" },
  { name: 'Travel', amount: 1820, percent: 32, icon: Plane, color: "hsl(var(--chart-2))" },
  { name: 'Dining', amount: 850, percent: 15, icon: Coffee, color: "hsl(var(--chart-3))" },
  { name: 'Shopping', amount: 620, percent: 11, icon: ShoppingBag, color: "hsl(var(--chart-4))" },
  { name: 'Transport', amount: 310, percent: 7, icon: Car, color: "hsl(var(--chart-5))" },
];

export function DashboardAnalytics() {
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-serif">Spending Analytics</h1>
          <p className="text-muted-foreground mt-1 font-light">Understand your financial habits across all accounts.</p>
        </div>

        {/* Diaspora Highlights */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-card/30 border-white/5 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl transition-colors group-hover:bg-primary/20 pointer-events-none" />
              <CardContent className="p-6 relative z-10 flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  <Globe className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-1">Total Sent Home (YTD)</div>
                  <div className="text-3xl font-serif text-white/90">${MOCK_DATA.remittance.ytdTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-card/30 border-white/5 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-eucalyptus/10 rounded-full blur-2xl transition-colors group-hover:bg-eucalyptus/20 pointer-events-none" />
              <CardContent className="p-6 relative z-10 flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-eucalyptus/10 flex items-center justify-center shrink-0 border border-eucalyptus/20">
                  <SendToBack className="w-7 h-7 text-eucalyptus" />
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-1">Fees Saved</div>
                  <div className="text-3xl font-serif text-white/90">$114.50</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
            <Card className="bg-card/30 border-white/5 shadow-xl h-full">
              <CardHeader className="pb-2">
                <CardTitle className="font-serif">Cash Flow</CardTitle>
                <CardDescription>Spending vs. Remittance over 6 months</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spendingOverTime} margin={{ top: 20, right: 0, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                        itemStyle={{ fontWeight: 500 }}
                        formatter={(value: number, name: string) => [`$${value}`, name === 'remitted' ? 'Sent Home' : 'Spent Here']}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="spent" name="Spent Here" stackId="a" fill="hsl(var(--muted))" radius={[0, 0, 4, 4]} />
                      <Bar dataKey="remitted" name="Sent Home" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="bg-card/30 border-white/5 shadow-xl h-full">
              <CardHeader className="pb-4">
                <CardTitle className="font-serif">Top Categories</CardTitle>
                <CardDescription>Year to date</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6 mt-2">
                  {categories.map((cat, idx) => (
                    <div key={idx} className="group/cat">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-white/5 group-hover/cat:bg-white/10 transition-colors", cat.name === 'Sent Home' && "bg-primary/10 border border-primary/20 group-hover/cat:bg-primary/20")}>
                            <cat.icon className={cn("w-4 h-4", cat.name === 'Sent Home' ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <span className="font-medium text-sm text-white/90">{cat.name}</span>
                        </div>
                        <span className="font-mono text-sm">${cat.amount}</span>
                      </div>
                      <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/5">
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
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}