import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../components/ui/resizable';
import { Guidelines } from '../parts';

export function ResizableDemo() {
  return (
    <div className="space-y-6">
      <div className="h-72 max-w-3xl overflow-hidden rounded-xl border bg-card text-card-foreground">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={35} minSize={22}>
            <div className="flex h-full flex-col gap-2 bg-muted/40 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recipients
              </p>
              <span>Selam Tesfaye</span>
              <span>Dawit Bekele</span>
              <span>Hanna Girma</span>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={65} minSize={40}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={62}>
                <div className="flex h-full flex-col justify-center gap-1 p-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Transfer to Selam
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">$120.00</p>
                  <p className="text-sm text-muted-foreground">
                    Selam receives Br 15,240 — illustrative rate.
                  </p>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={38}>
                <div className="flex h-full items-center gap-4 bg-muted/40 px-6 text-sm text-muted-foreground">
                  <span>Fee $1.99</span>
                  <span>Arrives in minutes</span>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        Handles are keyboard operable: focus a handle and use the arrow keys to
        resize each panel.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Set sensible minSize values so a panel can never be dragged to an unusable width.',
            },
            {
              kind: 'do',
              text: 'Use resizable layouts for power-user desktop views like a recipient list beside transfer detail.',
            },
            {
              kind: 'dont',
              text: 'Rely on resizable split views on mobile, where there is no room to drag; stack the panels instead.',
            },
          ]}
        />
      </div>
    </div>
  );
}
