import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Wallet } from "lucide-react";
import {
  BILL_INFO,
  CHECKING_BASE_BALANCE,
  formatUSD,
  payBill,
  useDemoState,
  type BillId,
} from "@/lib/demo-state";

export function PayBillDialog({
  bill,
  open,
  onOpenChange,
}: {
  bill: BillId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { checkingDeducted } = useDemoState();
  const [step, setStep] = useState<"confirm" | "success">("confirm");

  useEffect(() => {
    if (open) setStep("confirm");
  }, [open]);

  const info = BILL_INFO[bill];
  const checkingAvailable = CHECKING_BASE_BALANCE - checkingDeducted;

  const handleConfirm = () => {
    payBill(bill);
    setStep("success");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-white/10 rounded-2xl">
        <AnimatePresence mode="wait">
          {step === "confirm" ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="font-serif text-xl">Pay Statement Balance</DialogTitle>
                <DialogDescription>{info.name} &middot; Due {info.due}</DialogDescription>
              </DialogHeader>

              <div className="my-6 space-y-4">
                <div className="text-center py-2">
                  <div className="text-4xl font-serif text-white/90">{formatUSD(info.amount)}</div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">Statement balance</div>
                </div>

                <div className="flex items-center gap-3 bg-background/50 border border-white/10 rounded-xl p-3">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90">Checking &bull;&bull;&bull;&bull; 8834</div>
                    <div className="text-xs text-muted-foreground">Available: {formatUSD(checkingAvailable)}</div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-white/5 px-2 py-1 rounded">
                    From
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="gold" className="w-full h-11 font-medium" onClick={handleConfirm}>
                  Confirm Payment
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
                className="mx-auto w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-5"
              >
                <Check className="w-8 h-8 text-green-400" />
              </motion.div>
              <DialogTitle className="font-serif text-xl mb-1">Payment Sent</DialogTitle>
              <DialogDescription>
                {formatUSD(info.amount)} paid from Checking &bull;&bull;&bull;&bull; 8834
              </DialogDescription>
              <div className="text-xs text-muted-foreground mt-3">
                Your {info.name} balance is now $0.00.
              </div>
              <Button variant="gold" className="w-full h-11 font-medium mt-6" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
