import React, { useState, useEffect, useRef } from "react";

interface CustomResponsiveContainerProps {
  children: (width: number, height: number) => React.ReactNode;
}

export const CustomResponsiveContainer: React.FC<CustomResponsiveContainerProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      // Use standard callback to avoid synchronous state updates during layout
      setDimensions({ width, height });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative min-h-[50px]" id="custom-responsive-container">
      {dimensions.width > 0 && dimensions.height > 0 && children(dimensions.width, dimensions.height)}
    </div>
  );
};
