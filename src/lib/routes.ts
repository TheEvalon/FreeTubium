export type Route = "home" | "queue" | "history" | "settings";

export const ROUTE_TITLES: Record<Route, string> = {
  home: "New download",
  queue: "Downloads",
  history: "History",
  settings: "Settings",
};
