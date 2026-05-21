import { TopNavView } from "./TopNavView";

// Server wrapper kept so the page owns one stable `<TopNav />` import.
// The visible navbar is intentionally landing-local now; it no longer
// performs OAuth session work just to render section anchors.
export function TopNav() {
  return <TopNavView />;
}
