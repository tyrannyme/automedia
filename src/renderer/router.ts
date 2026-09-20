import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { StudioPage } from "@/studio.tsx";

const rootRoute = createRootRoute();

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: StudioPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([studioRoute]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
