import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '../../components/ui/avatar';
import { Guidelines, Row, Stack } from '../parts';

export function AvatarDemo() {
  const imageSrc = `${import.meta.env.BASE_URL}favicon.svg`;

  return (
    <div className="max-w-lg space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Sizes">
        <Avatar className="h-8 w-8">
          <AvatarImage src={imageSrc} alt="Selam Tesfaye" />
          <AvatarFallback className="bg-coffee text-coffee-foreground text-xs">
            ST
          </AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarImage src={imageSrc} alt="Selam Tesfaye" />
          <AvatarFallback className="bg-coffee text-coffee-foreground">
            ST
          </AvatarFallback>
        </Avatar>
        <Avatar className="h-14 w-14">
          <AvatarImage src={imageSrc} alt="Selam Tesfaye" />
          <AvatarFallback className="bg-coffee text-coffee-foreground text-lg">
            ST
          </AvatarFallback>
        </Avatar>
      </Row>

      <Stack label="Image vs. initials fallback">
        <Row>
          <Avatar>
            <AvatarImage src={imageSrc} alt="Samra Pay" />
            <AvatarFallback>SP</AvatarFallback>
          </Avatar>
          <Avatar>
            {/* Empty src forces the fallback to render */}
            <AvatarImage src="" alt="Dawit Bekele" />
            <AvatarFallback className="bg-eucalyptus text-eucalyptus-foreground">
              DB
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarImage src="" alt="Hanna Girma" />
            <AvatarFallback className="bg-berbere text-berbere-foreground">
              HG
            </AvatarFallback>
          </Avatar>
        </Row>
        <p className="text-xs text-muted-foreground">
          When the image is missing or still loading, the initials fallback shows
          in a per-recipient token color.
        </p>
      </Stack>

      <Stack label="Stacked recipients">
        <div className="flex -space-x-3">
          <Avatar className="ring-2 ring-card">
            <AvatarFallback className="bg-coffee text-coffee-foreground">
              ST
            </AvatarFallback>
          </Avatar>
          <Avatar className="ring-2 ring-card">
            <AvatarFallback className="bg-eucalyptus text-eucalyptus-foreground">
              DB
            </AvatarFallback>
          </Avatar>
          <Avatar className="ring-2 ring-card">
            <AvatarFallback className="bg-berbere text-berbere-foreground">
              HG
            </AvatarFallback>
          </Avatar>
          <Avatar className="ring-2 ring-card">
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              +5
            </AvatarFallback>
          </Avatar>
        </div>
        <p className="text-xs text-muted-foreground">
          Recently paid: Selam, Dawit, Hanna and 5 more.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Always supply an initials fallback and descriptive alt text so a recipient is identifiable before the image loads.',
            },
            {
              kind: 'do',
              text: 'Use a per-recipient token color (coffee, eucalyptus, berbere) so fallbacks stay distinguishable at a glance.',
            },
            {
              kind: 'dont',
              text: 'Stack more avatars than fit — cap the group with a “+N” count instead of an endless row.',
            },
            {
              kind: 'dont',
              text: 'Rely on the avatar alone to identify a payee for a transfer; pair it with the name and account.',
            },
          ]}
        />
      </div>
    </div>
  );
}
