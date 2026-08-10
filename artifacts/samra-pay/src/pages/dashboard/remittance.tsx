import { useState, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDown, History, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMO_RATE = 180;

const recentTransfers = [
  { id: 1, recipient: "Abebe Bekele", location: "Addis Ababa, ET", date: "Jun 12, 2024", usd: 500, etb: 90000, status: "Completed" },
  { id: 2, recipient: "Tigist Haile", location: "Hawassa, ET", date: "May 28, 2024", usd: 300, etb: 54000, status: "Completed" },
];

export function DashboardRemittance() {
  const [usdAmount, setUsdAmount] = useState<string>("500");
  const [etbAmount, setEtbAmount] = useState<string>("");

  useEffect(() => {
    const num = parseFloat(usdAmount);
    if (!isNaN(num)) {
      setEtbAmount((num * PROMO_RATE).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
      setEtbAmount("0.00");
    }
  }, [usdAmount]);

  const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d.]/g, "");
    setUsdAmount(val);
  };

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif">Remittance</h1>
          <p className="text-muted-foreground mt-1">Send money home instantly, with zero fees.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="bg-card/50 border-white/5 shadow-xl relative overflow-hidden border-primary/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
            <CardHeader>
              <CardTitle>Send Money</CardTitle>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-medium tracking-widest uppercase w-fit mt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                180 ETB Promo Rate Active
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-background border border-white/5 rounded-2xl p-4 flex flex-col">
                  <label className="text-sm text-muted-foreground mb-2">You send</label>
                  <div className="flex items-center">
                    <span className="text-2xl text-muted-foreground mr-2">$</span>
                    <input 
                      type="text"
                      value={usdAmount}
                      onChange={handleUsdChange}
                      className="bg-transparent text-4xl font-mono outline-none w-full text-foreground placeholder:text-muted"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-white/5">
                      <span className="font-medium">USD</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 text-right">Balance: $4,250.00</div>
                </div>

                <div className="flex justify-center -my-2 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary backdrop-blur-sm shadow-lg">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col">
                  <label className="text-sm text-primary mb-2">Recipient gets</label>
                  <div className="flex items-center">
                    <input 
                      type="text"
                      value={etbAmount}
                      readOnly
                      className="bg-transparent text-4xl font-mono outline-none w-full text-primary placeholder:text-primary/50"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/30">
                      <span className="font-medium text-primary">ETB</span>
                    </div>
                  </div>
                  <div className="text-xs text-primary/70 mt-2 text-right">No transfer fees</div>
                </div>

                <Button variant="gold" size="lg" className="w-full rounded-xl text-lg h-14 mt-4">
                  Continue Transfer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" />
                Recent Transfers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentTransfers.map((t) => (
                  <div key={t.id} className="p-4 rounded-xl border border-white/5 bg-background/50 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-medium">
                          {t.recipient.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium">{t.recipient}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {t.location}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-primary">{t.etb.toLocaleString()} ETB</div>
                        <div className="text-xs text-muted-foreground">Sent ${t.usd}</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-white/5 text-xs text-muted-foreground">
                      <span>{t.date}</span>
                      <span className="text-green-400 font-medium">{t.status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-6 border-white/5">View All History</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}