import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { watchAppearance } from "@/appearance.ts";
import { router } from "@/router.ts";
import "@/index.css";

watchAppearance("system");

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
