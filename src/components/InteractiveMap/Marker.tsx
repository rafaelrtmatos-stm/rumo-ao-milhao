import type { FC } from 'react';
import { motion } from 'motion/react';

interface MarkerProps {
  id: string;
  x: number;
  y: number;
  size: number;
  color?: string;
  label?: string;
  isActive?: boolean;
  onClick?: () => void;
}

export const Marker: FC<MarkerProps> = ({
  id,
  x,
  y,
  size,
  color = '#3B82F6',
  label,
  isActive = false,
  onClick,
}) => {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      onClick={onClick}
      className="absolute cursor-pointer group"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
      }}
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
    >
      {/* Main Marker Circle */}
      <motion.div
        animate={
          isActive
            ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }
            : { scale: 1, opacity: 1 }
        }
        transition={{
          duration: isActive ? 0.6 : 0.2,
          repeat: isActive ? Infinity : 0,
        }}
        className="rounded-full border-2 border-white shadow-lg"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          boxShadow: `0 0 ${size * 0.5}px ${color}80, 0 2px 8px rgba(0, 0, 0, 0.15)`,
        }}
      />

      {/* Label Tooltip */}
      {label && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 0, y: -5 }}
          whileHover={{ opacity: 1, y: -10 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap pointer-events-none"
        >
          {label}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900" />
        </motion.div>
      )}
    </motion.div>
  );
};

/**
 * Draw markers on canvas at high resolution
 */
export const drawMarkersOnCanvas = (
  ctx: CanvasRenderingContext2D,
  markers: Array<{
    x: number;
    y: number;
    size: number;
    color: string;
    label?: string;
  }>,
  canvasWidth: number,
  canvasHeight: number
) => {
  markers.forEach((marker) => {
    const x = (marker.x / 100) * canvasWidth;
    const y = (marker.y / 100) * canvasHeight;

    // Draw circle
    ctx.beginPath();
    ctx.arc(x, y, marker.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = marker.color;
    ctx.fill();

    // Draw border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  });
};
