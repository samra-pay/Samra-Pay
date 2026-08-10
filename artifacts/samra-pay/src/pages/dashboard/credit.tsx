import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, CheckCircle2, Flame, Award, ArrowRight, ShieldCheck, Target } from "lucide-react";
import { 
  LineChart, 
  Line, 
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const creditScoreData = [
  { month: 'Jan', score: 710 },
  { month: 'Feb', score: 715 },
  { month: 'Mar', score: 722 },
  { month: 'Apr', score: 728 },
  { month: 'May', score: 735 },
  { month: 'Jun', score: 745 },
];

const tiers = [
  { name: "Building", min: 300, max: 649, color: "text-muted-foreground", bg: "bg-muted-foreground" },
  { name: "Solid", min: 650, max: 719, color: "text-blue-400", bg: "bg-blue-400" },
  { name: "Excellent", min: 720, max: 779, color: "text-green-400", bg: "bg-green-400" },
  { name: "Elite", min: 780, max: 850, color: "text-primary", bg: "bg-primary" },
];

export function DashboardCredit() {
  const currentScore = 745;
  const nextTier = tiers.find(t => t.min > currentScore);
  const currentTier = tiers.find(t => currentScore >= t.min && currentScore <= t.max);
  
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-serif">Credit Health</h1>
          <p className="text-muted-foreground mt-1 font-light">Track your progress toward your American dream.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Gamified Ring & Ladder */}
          <Card className="bg-card/30 border-white/5 shadow-2xl relative overflow-hidden lg:col-span-2">
            {/* Subtle glow behind ring */}
            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-green-500/10 rounded-full blur-[100px] pointer-events-none" />
            
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground uppercase tracking-widest">
                <span>FICO® Score 8</span>
                <span className="flex items-center gap-1.5 text-xs text-white/50 lowercase normal-case tracking-normal">
                  <ShieldCheck className="w-4 h-4" /> Updated 2 days ago
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 flex flex-col md:flex-row items-center gap-12 pt-6">
              
              {/* Score Gauge */}
              <div className="relative w-64 h-64 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-[135deg]" viewBox="0 0 100 100">
                  {/* Track */}
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/5" strokeDasharray="212 283" strokeLinecap="round" />
                  {/* Progress (simulating ~75% of the gauge length which represents 300 to 850) */}
                  <motion.circle 
                    initial={{ strokeDashoffset: 212 }}
                    animate={{ strokeDashoffset: 212 - (212 * 0.8) }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" 
                    className="text-green-400" 
                    strokeDasharray="212 283" 
                    strokeLinecap="round" 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center -mt-2">
                  <motion.span 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-6xl font-serif text-white/90"
                  >
                    745
                  </motion.span>
                  <motion.span 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-green-400 font-medium text-sm flex items-center gap-1 mt-1 bg-green-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider"
                  >
                    <TrendingUp className="w-3 h-3" /> +12 Pts
                  </motion.span>
                </div>
              </div>

              {/* Ladder & Next Milestone */}
              <div className="flex-1 w-full space-y-8">
                {/* Milestone Teaser */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                  className="bg-primary/5 border border-primary/20 rounded-2xl p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Target className="w-5 h-5 text-primary" />
                    <span className="font-serif text-xl">Next Milestone</span>
                  </div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-medium text-white/80">35 pts to 780</span>
                    <span className="text-[10px] text-primary uppercase tracking-widest font-semibold">Elite Tier</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-primary w-[80%] rounded-full shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Unlocks elevated co-brand offers and lower remittance fees. Keep utilization under 10% this cycle to hit it.
                  </p>
                </motion.div>

                {/* Tiers Ladder */}
                <div className="space-y-3">
                  {tiers.map((tier) => (
                    <div key={tier.name} className="flex items-center gap-4 group">
                      <div className="w-20 text-xs font-medium text-right text-muted-foreground uppercase tracking-widest">{tier.name}</div>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 relative overflow-hidden">
                        {currentTier?.name === tier.name && (
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 1 }}
                            className={cn("absolute top-0 left-0 h-full", tier.bg)} 
                          />
                        )}
                      </div>
                      <div className="w-16 text-xs font-mono text-muted-foreground">{tier.min}+</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Streaks & Achievements Column */}
          <div className="space-y-6">
            {/* Streak */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-card/30 border-white/5 shadow-xl relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
                <CardContent className="p-6 relative z-10 flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                    <Flame className="w-7 h-7 text-orange-400" />
                  </div>
                  <div>
                    <div className="text-3xl font-serif text-white/90 mb-1">14 Months</div>
                    <div className="text-sm font-medium text-orange-400">Perfect payment streak</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Achievements */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="bg-card/30 border-white/5 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Recent Achievements</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { title: "6-Month Climb", desc: "+35 pts since Jan", icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10" },
                    { title: "Low Utilization", desc: "Under 20% total usage", icon: Award, color: "text-primary", bg: "bg-primary/10" },
                    { title: "Perfect History", desc: "No missed payments", icon: CheckCircle2, color: "text-blue-400", bg: "bg-blue-500/10" },
                  ].map((badge, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", badge.bg)}>
                        <badge.icon className={cn("w-5 h-5", badge.color)} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white/90">{badge.title}</div>
                        <div className="text-xs text-muted-foreground">{badge.desc}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* Chart Row */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="bg-card/30 border-white/5 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
              <CardTitle className="text-lg font-serif">Score History</CardTitle>
              <span className="text-sm text-green-400 font-medium bg-green-500/10 px-3 py-1 rounded-full uppercase tracking-wider">+35 Pts in 6 Months</span>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={creditScoreData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                      itemStyle={{ color: 'hsl(var(--green-400))', fontWeight: 500 }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#4ade80" 
                      strokeWidth={3} 
                      dot={{ fill: '#4ade80', strokeWidth: 2, r: 4 }} 
                      activeDot={{ r: 6, fill: '#4ade80', strokeWidth: 0 }} 
                      animationDuration={1500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageTransition>
  );
}