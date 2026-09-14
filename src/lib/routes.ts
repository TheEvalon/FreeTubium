export type Route = "home" | "watch" | "queue" | "history" | "settings";

export const ROUTE_TITLES: Record<Route, string> = {
  home: "New download",
  watch: "Watch",
  queue: "Downloads",
  history: "History",
  settings: "Settings",
};
