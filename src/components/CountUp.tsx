import React, { useEffect, useState, useRef } from 'react';

interface CountUpProps {
  end: number;
  decimals?: number;
  duration?: number; // duration in ms
  id?: string;
}

export const CountUp: React.FC<CountUpProps> = ({ end, decimals = 0, duration = 1200, id }) => {
  const [count, setCount] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const startValRef = useRef<number>(0);
  const endValRef = useRef<number>(end);

  useEffect(() => {
    // We always transition from the current display value to the new end value
    // to make the animation smooth during filter changes!
    const startValue = count;
    const change = end - startValue;
    
    startTimeRef.current = null;
    let animId: number;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = timestamp - startTimeRef.current;
      const progressRatio = Math.min(progress / duration, 1);
      
      // Easing function: easeOutExpo
      const ease = progressRatio === 1 ? 1 : 1 - Math.pow(2, -10 * progressRatio);
      
      const nextValue = startValue + change * ease;
      setCount(nextValue);

      if (progressRatio < 1) {
        animId = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [end, duration]);

  return (
    <span id={id} className="font-mono">
      {count.toLocaleString('de-DE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
};
