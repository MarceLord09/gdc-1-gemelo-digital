import { useEffect, useRef, useState } from "react";

/** Ancho medido de un contenedor, para dibujar SVG a resolución de píxel real
 * en vez de estirar un viewBox (que distorsiona esquinas redondeadas). */
export function useElementWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width || fallback);
    return () => observer.disconnect();
  }, [fallback]);

  return { ref, width };
}
