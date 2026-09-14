import { createContext, useContext, type ReactNode } from "react";

import type { Route } from "../lib/routes";

/**
 * The current route and a way to change it.
 *
 * The sidebar gets the route as props because it sits right next to the state,
 * but sign-in prompts appear deep inside the download queue and both players,
 * and every one of them needs to send the user to the same settings section.
 * A context spares three unrelated component trees a navigation prop.
 */
interface NavigationContextValue {
  route: Route;
  /**
   * `focus` names a section on the destination screen to scroll to and
   * highlight, since Settings is long enough that landing at the top leaves
   * the user hunting for whatever they were sent there to change.
   */
  navigate: (route: Route, focus?: string) => void;
  focus: string | null;
  clearFocus: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationContextValue;
  children: ReactNode;
}) {
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used inside a NavigationProvider");
  }
  return context;
}

/** Section ids that can be focused, so call sites cannot drift from targets. */
export const SETTINGS_YOUTUBE_ACCOUNT = "youtube-account";
