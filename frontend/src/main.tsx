import "./index.css";
import "@fontsource/inter/index.css";
import "@fontsource/nunito/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import App from "./App";
import { applyThemeToDocument, readInitialThemeMode } from "./hooks/useTheme";

const router = createBrowserRouter([
  {
    path: "*",
    element: <App />,
  },
]);

applyThemeToDocument(readInitialThemeMode());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
