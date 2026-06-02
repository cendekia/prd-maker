"use client";

import { useEffect, useState } from "react";

/** Matches the Tailwind `md` breakpoint: mobile is anything below 768px. */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Track whether the viewport is in the mobile range.
 *
 * Returns `false` during SSR and the first client render (desktop-first, so
 * markup is hydration-stable), then corrects on mount. Drives the JS-side
 * concerns CSS can't express on its own — forcing the editor read-only and
 * swapping the page-tree sidebar for an off-canvas drawer.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
