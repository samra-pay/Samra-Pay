import { ArrowUpRight } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../../components/ui/carousel';
import { Guidelines } from '../parts';

const promos = [
  {
    title: 'Zero-fee first transfer',
    body: 'Send your first amount to Addis Ababa with no fee. Illustrative offer.',
    accent: 'from-primary/80 via-primary/40 to-muted',
  },
  {
    title: 'Refer a friend',
    body: 'Invite family in the diaspora and both of you earn a bonus.',
    accent: 'from-eucalyptus/80 via-eucalyptus/30 to-muted',
  },
  {
    title: 'Savings pockets',
    body: 'Set aside USD for school fees or a trip home, one pocket at a time.',
    accent: 'from-coffee/80 via-coffee/30 to-muted',
  },
];

export function CarouselDemo() {
  return (
    <div className="space-y-6">
      <div className="max-w-md px-12 py-6">
        <Carousel opts={{ loop: true }}>
          <CarouselContent>
            {promos.map((promo) => (
              <CarouselItem key={promo.title}>
                <div
                  className={`flex aspect-[4/3] flex-col justify-end gap-2 rounded-xl border bg-gradient-to-br p-6 text-card-foreground ${promo.accent}`}
                >
                  <ArrowUpRight className="size-5 opacity-80" />
                  <p className="text-lg font-semibold">{promo.title}</p>
                  <p className="text-sm opacity-90">{promo.body}</p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        Previous/next controls are focusable buttons and disable at the ends
        unless looping; arrow keys also move between slides.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use carousels for equal-weight promotional cards where order does not imply priority.',
            },
            {
              kind: 'do',
              text: 'Keep prev/next controls visible so the content is obviously navigable, not just swipeable.',
            },
            {
              kind: 'dont',
              text: 'Place essential steps of the send-money flow in a carousel — people miss off-screen slides.',
            },
            {
              kind: 'dont',
              text: 'Auto-advance faster than a person can read a promo card.',
            },
          ]}
        />
      </div>
    </div>
  );
}
