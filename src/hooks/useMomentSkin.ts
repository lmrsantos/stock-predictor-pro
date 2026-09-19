// hooks/useMomentSkin.ts
// Applies the Quant Moment app skin (dark neutral surfaces, system type) while
// a Moment screen is mounted, and removes it on the way out so the main
// terminal keeps its own look.

import { useEffect } from "react";

export function useMomentSkin() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("qm-theme");
    return () => el.classList.remove("qm-theme");
  }, []);
}
