import React from 'react';

interface DatabaseUsagePanelProps {
  currentEntryCount: number;
  totalCapacity: number;
}

const DatabaseUsagePanel: React.FC<DatabaseUsagePanelProps> = ({ currentEntryCount, totalCapacity }) => {
  const usagePercentage = totalCapacity > 0 ? (currentEntryCount / totalCapacity) * 100 : 0;
  const clampedPercentage = Math.max(0, Math.min(100, usagePercentage));

  // SVG dimensions
  const svgWidth = 200;
  const svgHeight = 250;
  const cylinderRx = 80;
  const cylinderRy = 25;
  const cylinderHeight = 180;
  const cylinderY = (svgHeight - cylinderHeight) / 2;

  const fillHeight = cylinderHeight * (clampedPercentage / 100);
  const fillY = cylinderY + cylinderHeight - fillHeight;

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border text-theme-text flex flex-col items-center h-full">
      <h3 className="text-xl font-semibold mb-4 text-center">Database Storage Usage</h3>
      <div className="flex-grow flex items-center justify-center w-full">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          aria-labelledby="db-usage-title"
          role="img"
        >
          <title id="db-usage-title">Database storage usage cylinder graph</title>
          <desc>
            A 3D cylinder showing that {formatNumber(currentEntryCount)} of {formatNumber(totalCapacity)} records are currently stored.
            Usage is at {usagePercentage.toFixed(2)}%.
          </desc>

          <defs>
            <linearGradient id="cylinder-body-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--color-border)', stopOpacity: 1 }} />
              <stop offset="50%" style={{ stopColor: 'var(--color-card-background)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-border)', stopOpacity: 1 }} />
            </linearGradient>
            <linearGradient id="cylinder-fill-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--color-secondary)', stopOpacity: 1 }} />
              <stop offset="50%" style={{ stopColor: 'var(--color-primary)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-secondary)', stopOpacity: 1 }} />
            </linearGradient>
          </defs>

          {/* Bottom Ellipse */}
          <ellipse
            cx={svgWidth / 2}
            cy={cylinderY + cylinderHeight}
            rx={cylinderRx}
            ry={cylinderRy}
            className="fill-current text-slate-400 dark:text-slate-600 opacity-60"
          />

          {/* Cylinder Body (Back) */}
          <rect
            x={(svgWidth / 2) - cylinderRx}
            y={cylinderY}
            width={cylinderRx * 2}
            height={cylinderHeight}
            fill="url(#cylinder-body-gradient)"
          />
          
          {/* Fill Content */}
          <g>
            {/* Bottom of fill */}
            {fillHeight > 0 && (
                 <ellipse
                    cx={svgWidth / 2}
                    cy={cylinderY + cylinderHeight}
                    rx={cylinderRx}
                    ry={cylinderRy}
                    className="fill-current"
                    style={{ color: 'var(--color-primary)'}}
                    opacity="0.7"
                />
            )}
            {/* Body of fill */}
            <rect
              x={(svgWidth / 2) - cylinderRx}
              y={fillY}
              width={cylinderRx * 2}
              height={fillHeight}
              fill="url(#cylinder-fill-gradient)"
              style={{ transition: 'y 0.5s ease-out, height 0.5s ease-out' }}
            />
            {/* Top of fill - dynamic ellipse */}
            {fillHeight > 0 && (
                <ellipse
                    cx={svgWidth / 2}
                    cy={fillY}
                    rx={cylinderRx}
                    ry={cylinderRy}
                    fill="url(#cylinder-fill-gradient)"
                    style={{ transition: 'cy 0.5s ease-out' }}
                />
            )}
          </g>

          {/* Top Ellipse (Outline) */}
          <ellipse
            cx={svgWidth / 2}
            cy={cylinderY}
            rx={cylinderRx}
            ry={cylinderRy}
            className="fill-current text-slate-200 dark:text-slate-500 opacity-50"
          />
          <ellipse
            cx={svgWidth / 2}
            cy={cylinderY}
            rx={cylinderRx}
            ry={cylinderRy}
            className="stroke-current text-slate-400 dark:text-slate-600"
            fill="none"
            strokeWidth="1.5"
          />

        </svg>
      </div>
      <div className="text-center mt-4 w-full">
        <p className="text-3xl font-bold text-theme-primary">
          {usagePercentage.toFixed(4)}%
        </p>
        <p className="text-sm text-gray-500">
          <span className="font-medium">{formatNumber(currentEntryCount)}</span> / {formatNumber(totalCapacity)} entries
        </p>
      </div>
    </div>
  );
};

export default DatabaseUsagePanel;
