import { Card, CardContent } from '@workspace/samra-pay-ds/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground dark">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-berbere" />
            <h1 className="text-2xl font-bold">
              404 Page Not Found
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            This operational view is not available.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
