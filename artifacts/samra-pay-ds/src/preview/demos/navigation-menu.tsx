import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '../../components/ui/navigation-menu';
import { Guidelines } from '../parts';

export function NavigationMenuDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Marketing site header
      </p>
      <div className="min-h-56">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Send money</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[420px] gap-2 p-4 sm:grid-cols-2">
                  <li>
                    <NavigationMenuLink
                      href="#page=navigation-menu"
                      className="block rounded-md p-3 hover:bg-accent"
                    >
                      <span className="font-medium">USD → ETB transfers</span>
                      <span className="block text-sm text-muted-foreground">
                        Send to any Ethiopian bank or wallet.
                      </span>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink
                      href="#page=navigation-menu"
                      className="block rounded-md p-3 hover:bg-accent"
                    >
                      <span className="font-medium">Cash pickup</span>
                      <span className="block text-sm text-muted-foreground">
                        Recipients collect birr at partner branches.
                      </span>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink
                      href="#page=navigation-menu"
                      className="block rounded-md p-3 hover:bg-accent"
                    >
                      <span className="font-medium">Pay bills</span>
                      <span className="block text-sm text-muted-foreground">
                        Utilities and tuition back home.
                      </span>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink
                      href="#page=navigation-menu"
                      className="block rounded-md p-3 hover:bg-accent"
                    >
                      <span className="font-medium">Airtime top-up</span>
                      <span className="block text-sm text-muted-foreground">
                        Recharge a phone in seconds.
                      </span>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Company</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-72 gap-2 p-4">
                  <li>
                    <NavigationMenuLink
                      href="#page=navigation-menu"
                      className="block rounded-md p-3 hover:bg-accent"
                    >
                      <span className="font-medium">About Samra Pay</span>
                      <span className="block text-sm text-muted-foreground">
                        Built for the Ethiopian diaspora.
                      </span>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink
                      href="#page=navigation-menu"
                      className="block rounded-md p-3 hover:bg-accent"
                    >
                      <span className="font-medium">Help center</span>
                      <span className="block text-sm text-muted-foreground">
                        Guides, limits and support.
                      </span>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                href="#page=navigation-menu"
                className={navigationMenuTriggerStyle()}
              >
                Pricing
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuIndicator />
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use the mega-menu panel to preview product areas (transfers, bills, top-up) with a one-line description each.',
            },
            {
              kind: 'do',
              text: 'Mix triggers with plain links — flat destinations like "Pricing" do not need a dropdown.',
            },
            {
              kind: 'dont',
              text: 'Overload a single panel with more than a handful of links; split dense catalogs into grouped columns.',
            },
          ]}
        />
      </div>
    </div>
  );
}
