import React from 'react';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ onZoomIn, onZoomOut, onReset }) => {
  return (
    <div className="absolute bottom-2 right-2 flex flex-col space-y-1 bg-black bg-opacity-40 p-1 rounded-md z-10">
      <button
        title="Zoom In"
        onClick={onZoomIn}
        className="w-8 h-8 flex items-center justify-center text-white rounded-md hover:bg-white hover:bg-opacity-20 transition-colors"
        aria-label="Zoom In"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
        </svg>
      </button>
      <button
        title="Zoom Out"
        onClick={onZoomOut}
        className="w-8 h-8 flex items-center justify-center text-white rounded-md hover:bg-white hover:bg-opacity-20 transition-colors"
        aria-label="Zoom Out"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
        </svg>
      </button>
      <button
        title="Reset Zoom"
        onClick={onReset}
        className="w-8 h-8 flex items-center justify-center text-white rounded-md hover:bg-white hover:bg-opacity-20 transition-colors"
        aria-label="Reset Zoom"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m12 4V4h-4M4 16v4h4m12-4v4h-4" />
        </svg>
      </button>
    </div>
  );
};

export default ZoomControls;
