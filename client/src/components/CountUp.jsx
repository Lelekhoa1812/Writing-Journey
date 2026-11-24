import { useEffect, useState } from 'react';

export default function CountUp({ to = 0, decimals = 0 }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const target = Number(to) || 0;
    const start = performance.now();
    const duration = 720;
    let frame = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);

  return decimals ? value.toFixed(decimals) : String(Math.round(value));
}
