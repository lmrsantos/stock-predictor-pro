import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Default to dark theme so the terminal matches the landing page aesthetic.
// Respect a previously stored user preference from ThemeToggle.
const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
if (stored !== "light") {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
