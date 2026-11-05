import { useEffect, useState } from "react";

// Returns [ref, inView].
//   once = true  : inView turns true the first time the element scrolls into view and stays true.
//   once = false : inView follows the element, so it turns false again when it scrolls back out
//                  (used for the landing page, where text fades in AND fades out).
// With reduced motion inView is always true, so nothing is hidden or animated.
export function useInView<T extends Element>(once = true): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!node || reduced) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      // The small bottom margin makes things appear just after they enter, and vanish just before they leave
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, once, reduced]);

  return [setNode, reduced || inView];
}