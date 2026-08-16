import { CircleAlert } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { Card, CardContent } from "@workspace/samra-pay-ds/components/ui/card";

import { PageTransition } from "@/components/page-transition";

export function ApiModeUnavailable({ section }: { section: string }) {
  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl py-12">
        <Card className="border-primary/20 bg-card/30 shadow-2xl">
          <CardContent className="p-8 text-center">
            <CircleAlert className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-5 text-2xl font-serif">
              {section} is not connected in API mode
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              API mode does not substitute the design-preview balances or
              transactions shown in mock mode. This section will remain
              unavailable until its backend contract is implemented.
            </p>
            <Button asChild variant="gold" className="mt-6 rounded-xl">
              <Link href="/dashboard">Return to backend overview</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
