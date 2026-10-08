"use client";
import { useEffect } from "react";
export function useKeyboardViewport(enabled: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return;
    const update = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      document.documentElement.style.setProperty(
        "--keyboard-inset",
        inset + "px",
      );
      const active = document.activeElement;
      if (!(
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ))
        return;
      const footer = document.querySelector(".bottom")?.getBoundingClientRect();
      const bottom =
        viewport.offsetTop + viewport.height - (footer?.height ?? 0) - 16;
      const r = active.getBoundingClientRect();
      if (r.bottom > bottom) window.scrollBy(0, r.bottom - bottom);
      else if (r.top < viewport.offsetTop + 16)
        window.scrollBy(0, r.top - viewport.offsetTop - 16);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.documentElement.style.removeProperty("--keyboard-inset");
    };
  }, [enabled]);
}
