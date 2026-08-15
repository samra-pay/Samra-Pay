import { AspectRatio } from '../../components/ui/aspect-ratio';
import { Guidelines, Stack } from '../parts';

export function AspectRatioDemo() {
  return (
    <div className="space-y-6">
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Stack label="16:9 — promo banner">
          <div className="overflow-hidden rounded-xl border bg-card">
            <AspectRatio ratio={16 / 9}>
              <div className="flex h-full items-end bg-gradient-to-br from-primary/80 via-primary/40 to-muted p-6 text-primary-foreground">
                <div>
                  <p className="text-lg font-semibold">Send money home</p>
                  <p className="text-sm opacity-90">
                    Fast transfers to Ethiopia — illustrative promo.
                  </p>
                </div>
              </div>
            </AspectRatio>
          </div>
        </Stack>

        <Stack label="1:1 — recipient card">
          <div className="mx-auto w-40 overflow-hidden rounded-xl border bg-card">
            <AspectRatio ratio={1}>
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-eucalyptus/70 to-muted p-4 text-eucalyptus-foreground">
                <span className="text-2xl font-semibold">ST</span>
                <span className="text-sm">Selam Tesfaye</span>
              </div>
            </AspectRatio>
          </div>
        </Stack>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Reserve a fixed ratio for media so promo banners and recipient tiles never shift the layout as they load.',
            },
            {
              kind: 'do',
              text: 'Match the ratio to the crop — 16:9 for wide banners, 1:1 for avatar-style tiles.',
            },
            {
              kind: 'dont',
              text: 'Wrap plain text blocks in an aspect ratio; it is meant for imagery and media, not paragraphs.',
            },
          ]}
        />
      </div>
    </div>
  );
}
