import { useEffect, useState } from 'react';

export default function CountUp({ to = 0, decimals = 0 }) {
  const target = Number(to) || 0;
  const [value, setValue] = useState(target);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    const duration = 720;
    let frame = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(target * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const done = window.setTimeout(() => setValue(target), duration + 40);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [target]);

  return decimals ? value.toFixed(decimals) : String(Math.round(value));
}
