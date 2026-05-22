import {
  Maximize2,
  Download,
  FileText,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import { motion } from 'motion/react';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onExportImage: () => void;
  onExportPDF: () => void;
  onToggleFullscreen: () => void;
  isFullscreen?: boolean;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onExportImage,
  onExportPDF,
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  const controls = [
    {
      icon: Plus,
      onClick: onZoomIn,
      label: 'Zoom In',
      shortcut: '+',
    },
    {
      icon: Minus,
      onClick: onZoomOut,
      label: 'Zoom Out',
      shortcut: '−',
    },
    {
      icon: RotateCcw,
      onClick: onReset,
      label: 'Reset',
      shortcut: 'R',
    },
    {
      icon: Download,
      onClick: onExportImage,
      label: 'Download PNG',
      shortcut: null,
    },
    {
      icon: FileText,
      onClick: onExportPDF,
      label: 'Download PDF',
      shortcut: null,
    },
    {
      icon: Maximize2,
      onClick: onToggleFullscreen,
      label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
      shortcut: 'F',
    },
  ];

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-40">
      {controls.map((control) => {
        const Icon = control.icon;
        return (
          <motion.button
            key={control.label}
            onClick={control.onClick}
            className="flex items-center justify-center w-10 h-10 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow border border-gray-200 hover:border-blue-300 group"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={control.label}
          >
            <Icon className="w-5 h-5 text-gray-700 group-hover:text-blue-600 transition-colors" />
            
            {/* Tooltip */}
            <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {control.label}
              {control.shortcut && (
                <span className="ml-2 text-gray-400">({control.shortcut})</span>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};
