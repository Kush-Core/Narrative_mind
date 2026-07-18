import "@/styles/globals.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AppRoot } from "@/app/AppRoot"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root is missing from index.html")

createRoot(rootElement).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
