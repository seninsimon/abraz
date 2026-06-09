import React, { useState, useRef, useEffect } from 'react';

interface LosslessZoomProps {
  children: React.ReactNode;
  maxScale?: number;
  minScale?: number;
  className?: string;
}

export const LosslessZoom: React.FC<LosslessZoomProps> = ({
  children,
  maxScale = 8,
  minScale = 1,
  className = '',
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Handle mouse wheel zoom centered on cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const zoomFactor = 0.1;
      const direction = e.deltaY < 0 ? 1 : -1;
      
      // Calculate new scale
      const nextScale = Math.min(Math.max(scale + direction * zoomFactor * scale, minScale), maxScale);
      
      if (nextScale === scale) return;

      // Zoom towards cursor location
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Coordinate matching translation adjustment
      const dx = mouseX - position.x;
      const dy = mouseY - position.y;
      
      const newX = mouseX - dx * (nextScale / scale);
      const newY = mouseY - dy * (nextScale / scale);

      setScale(nextScale);
      setPosition({ x: newX, y: newY });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scale, position, maxScale, minScale]);

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale === 1) return; // Only pan when zoomed in
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.5, maxScale));
  };

  const zoomOut = () => {
    setScale(prev => {
      const next = Math.max(prev - 0.5, minScale);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  return (
    <div 
      ref={containerRef}
      className={`lossless-zoom-container ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      style={{
        position: 'relative',
        overflow: 'hidden',
        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        width: '100%',
        height: '100%'
      }}
    >
      {/* Zoomable Wrapper Content */}
      <div
        className="lossless-zoom-wrapper"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          transition: isDragging ? 'none' : 'transform 100ms ease-out',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ imageRendering: 'crisp-edges', width: '100%', height: '100%' }}>
          {children}
        </div>
      </div>

      {/* Floating Control overlay UI */}
      <div className="zoom-controls-overlay" onClick={e => e.stopPropagation()}>
        <div className="zoom-indicator">{(scale * 100).toFixed(0)}%</div>
        <button className="zoom-btn" onClick={zoomIn} title="Zoom In">+</button>
        <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">-</button>
        {scale > 1 && (
          <button className="zoom-btn reset-btn" onClick={resetZoom} title="Reset Zoom">
            Reset
          </button>
        )}
      </div>

      {/* Floating pan instructions */}
      {scale > 1 && !isDragging && (
        <div className="pan-hint-overlay">
          <span>Click &amp; Drag to Pan Screen</span>
        </div>
      )}
    </div>
  );
};
