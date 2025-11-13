import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
// Fix: Import ChartType and ChartDesign from types.ts to break circular dependency.
import { VotingEntry, ValidationStatus, GovernmentStructureData, HistoricalStructure, ChartType, ChartDesign } from '../types';
import Button from './Button';
import Modal from './Modal';
import { votingDB } from '../services/dbService';
import LoadingSpinner from './LoadingSpinner';

// --- Utility Functions ---
const generatePastelColors = (count: number): string[] => {
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 137.508) % 360; // Use golden angle approximation
        colors.push(`hsl(${hue}, 70%, 80%)`);
    }
    return colors;
};

const adjustHslColor = (color: string, lightnessAdjustment: number): string => {
    const match = /hsl\((\d+\.?\d*),\s*(\d+\.?\d*)%,\s*(\d+\.?\d*)%\)/.exec(color);
    if (!match) return color;
    const [, h, s, l] = match.map(Number);
    const newL = Math.max(0, Math.min(100, l + lightnessAdjustment));
    return `hsl(${h}, ${s}%, ${newL}%)`;
};

// --- PieChart Component ---
interface PieChartProps {
    data: { label: string; value: number }[];
    title: string;
    design: ChartDesign;
}
  
const PieChart: React.FC<PieChartProps> = ({ data, title, design }) => {
    if (!data || data.length === 0) {
        return null;
    }

    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
        return null;
    }

    const colors = generatePastelColors(data.length);
    const radius = 80;
    const depth = design === '3d' ? 10 : 0;
    const cx = 100;
    const cy = design === '3d' ? 95 : 100;
    const innerRadius = design === 'doughnut' ? radius * 0.6 : 0;
    
    let startAngle = -90;

    const slicesInfo = data.map((item) => {
        const angle = (item.value / total) * 360;
        const endAngle = startAngle + (angle >= 360 ? 359.99 : angle); // Prevent full circle overlap issues
        const largeArcFlag = angle > 180 ? 1 : 0;

        const startX = cx + radius * Math.cos((startAngle * Math.PI) / 180);
        const startY = cy + radius * Math.sin((startAngle * Math.PI) / 180);
        const endX = cx + radius * Math.cos((endAngle * Math.PI) / 180);
        const endY = cy + radius * Math.sin((endAngle * Math.PI) / 180);

        const innerStartX = cx + innerRadius * Math.cos((startAngle * Math.PI) / 180);
        const innerStartY = cy + innerRadius * Math.sin((startAngle * Math.PI) / 180);
        const innerEndX = cx + innerRadius * Math.cos((endAngle * Math.PI) / 180);
        const innerEndY = cy + innerRadius * Math.sin((endAngle * Math.PI) / 180);

        const info = { largeArcFlag, startX, startY, endX, endY, innerStartX, innerStartY, innerEndX, innerEndY };
        startAngle = endAngle;
        return info;
    });

    const sideSlices = design === '3d'
        ? [...slicesInfo].reverse().map((info, index) => {
            const originalIndex = data.length - 1 - index;
            const d = [
                `M ${info.startX},${info.startY + depth}`,
                `A ${radius},${radius} 0 ${info.largeArcFlag} 1 ${info.endX},${info.endY + depth}`,
                `L ${info.endX},${info.endY}`,
                `A ${radius},${radius} 0 ${info.largeArcFlag} 0 ${info.startX},${info.startY}`,
                'Z',
            ].join(' ');
            return <path key={`side-${originalIndex}`} d={d} fill={adjustHslColor(colors[originalIndex], -20)} />;
        })
        : null;

    const topSlices = slicesInfo.map((info, index) => {
        let d;
        if (design === 'doughnut') {
            d = [
                `M ${info.startX},${info.startY}`,
                `A ${radius},${radius} 0 ${info.largeArcFlag} 1 ${info.endX},${info.endY}`,
                `L ${info.innerEndX},${info.innerEndY}`,
                `A ${innerRadius},${innerRadius} 0 ${info.largeArcFlag} 0 ${info.innerStartX},${info.innerStartY}`,
                'Z',
            ].join(' ');
        } else { // pie or 3d
            d = [
                `M ${cx},${cy}`,
                `L ${info.startX},${info.startY}`,
                `A ${radius},${radius} 0 ${info.largeArcFlag} 1 ${info.endX},${info.endY}`,
                'Z',
            ].join(' ');
        }
        const item = data[index];
        return (
            <path key={`top-${index}`} d={d} fill={colors[index]}>
                <title>{`${item.label}: ${item.value} (${((item.value / total) * 100).toFixed(1)}%)`}</title>
            </path>
        );
    });

    return (
        <div className="mt-6 p-4 border-t border-theme-border">
            <h5 className="font-semibold mb-4 text-center">{title}</h5>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                <svg viewBox={`0 0 200 ${200 + depth}`} width="200" height={200 + depth} aria-label={`Chart showing ${title}`} className="flex-shrink-0">
                    <desc>A chart breaking down voter distribution. Each slice represents a different category.</desc>
                    {sideSlices}
                    {topSlices}
                </svg>
                <div className="text-xs space-y-1 self-start md:self-center flex-shrink">
                    {data.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[index] }}></span>
                            <span>{item.label}: </span>
                            <span className="font-semibold">{item.value} ({((item.value / total) * 100).toFixed(1)}%)</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- GenderStats Component ---
const GenderStats: React.FC<{ voters: VotingEntry[] }> = ({ voters }) => {
    const genderCounts = useMemo(() => voters.reduce((acc, voter) => {
      const gender = voter.idCardData.gender?.toLowerCase().trim();
      if (gender === 'male') {
        acc.male++;
      } else if (gender === 'female') {
        acc.female++;
      } else {
        acc.other++;
      }
      return acc;
    }, { male: 0, female: 0, other: 0 }), [voters]);
  
    const total = genderCounts.male + genderCounts.female + genderCounts.other;
    if (total === 0) return null;
  
    const malePercent = (genderCounts.male / total) * 100;
    const femalePercent = (genderCounts.female / total) * 100;
    const otherPercent = (genderCounts.other / total) * 100;
  
    const MaleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>;
    const FemaleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-pink-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>;
    const OtherIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>;
  
    return (
      <div className="mt-6 p-4 border-t border-theme-border">
        <h5 className="font-semibold mb-4 text-center">Gender Demographics</h5>
        <div className="flex justify-center items-center gap-6 mb-4 text-sm text-theme-text">
          <div className="flex items-center gap-2" title="Male">
            <MaleIcon />
            <span className="font-bold">{genderCounts.male}</span>
          </div>
          <div className="flex items-center gap-2" title="Female">
            <FemaleIcon />
            <span className="font-bold">{genderCounts.female}</span>
          </div>
          <div className="flex items-center gap-2" title="Other/Unspecified">
            <OtherIcon />
            <span className="font-bold">{genderCounts.other}</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-4 flex overflow-hidden border border-theme-border">
          <div
            className="bg-blue-500 h-full transition-all duration-300"
            style={{ width: `${malePercent}%` }}
            title={`Male: ${malePercent.toFixed(1)}% (${genderCounts.male})`}
          ></div>
          <div
            className="bg-pink-500 h-full transition-all duration-300"
            style={{ width: `${femalePercent}%` }}
            title={`Female: ${femalePercent.toFixed(1)}% (${genderCounts.female})`}
          ></div>
          <div
            className="bg-gray-500 h-full transition-all duration-300"
            style={{ width: `${otherPercent}%` }}
            title={`Other/Unspecified: ${otherPercent.toFixed(1)}% (${genderCounts.other})`}
          ></div>
        </div>
      </div>
    );
};

// --- PositionBarChart Component ---
const PositionBarChart: React.FC<{ data: { label: string; value: number }[], title: string }> = ({ data, title }) => {
    if (!data || data.length === 0) {
        return null;
    }
    const maxValue = Math.max(...data.map(d => d.value));
    const sortedData = [...data].sort((a, b) => b.value - a.value);
    const colors = generatePastelColors(sortedData.length);

    return (
        <div className="mt-6 p-4 border-t border-theme-border">
            <h5 className="font-semibold mb-4 text-center">{title}</h5>
            <div className="space-y-3 text-sm">
                {sortedData.map((item, index) => (
                    <div key={item.label} className="flex items-center gap-4">
                        <span className="w-1/3 truncate text-right text-gray-600 dark:text-gray-300" title={item.label}>
                            {item.label}
                        </span>
                        <div className="w-2/3 flex items-center gap-2">
                            <div className="flex-grow bg-gray-200 dark:bg-slate-700 rounded-full h-5 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${(item.value / maxValue) * 100}%`,
                                        backgroundColor: colors[index],
                                    }}
                                    title={`${item.value} voters`}
                                ></div>
                            </div>
                            <span className="font-bold w-8 text-left">{item.value}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


interface GovernmentStructureProps {
  allVotingEntries: VotingEntry[];
}
interface SelectedNode {
  name: string;
  level: number; // 0: region, 1: province, 2: city
  path: string[];
}

const IconForPosition = ({ position }: { position: string }) => {
    const lowerPosition = position.toLowerCase();
    let icon = null;
    const title = position;
  
    if (lowerPosition.includes('president') || lowerPosition.includes('governor') || lowerPosition.includes('mayor')) {
      icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    } else if (lowerPosition.includes('senator') || lowerPosition.includes('representative') || lowerPosition.includes('councilor') || lowerPosition.includes('board member')) {
      icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-sky-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      );
    } else {
      icon = (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5a.997.997 0 01.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      );
    }
  
    return <span title={title}>{icon}</span>;
  };

const parseSheetData = (data: any[][]): GovernmentStructureData => {
  const structure: GovernmentStructureData = {};
  
  if (data.length < 2) {
    throw new Error("XLSX file must contain at least a header row and one data row.");
  }

  const headerRow = data[0];
  const headers = headerRow.map(h => String(h).trim().toLowerCase());
  
  const requiredHeaders = ['region', 'province', 'city'];
  const hasHeaders = requiredHeaders.every(h => headers.includes(h));

  if (!hasHeaders) {
    throw new Error("Invalid XLSX headers. Expected headers: 'Region', 'Province', 'City'.");
  }

  const regionIndex = headers.indexOf('region');
  const provinceIndex = headers.indexOf('province');
  const cityIndex = headers.indexOf('city');
  
  const dataRows = data.slice(1);

  dataRows.forEach((row, index) => {
    if (!Array.isArray(row) || row.length === 0) {
      console.warn(`Skipping empty row ${index + 2} in XLSX.`);
      return;
    }
    const region = row[regionIndex];
    const province = row[provinceIndex];
    const city = row[cityIndex];

    if (region && province && city) {
      if (!structure[region]) {
        structure[region] = {};
      }
      if (!structure[region][province]) {
        structure[region][province] = [];
      }
      if (!structure[region][province].includes(city)) {
        structure[region][province].push(city);
      }
    } else {
        console.warn(`Skipping invalid or incomplete row ${index + 2} in XLSX.`);
    }
  });

  return structure;
};

// Recursive Tree Node Component
const TreeNode: React.FC<{
  name: string;
  data: any;
  level: number;
  path: string[];
  selectedNode: SelectedNode | null;
  onSelectNode: (node: SelectedNode) => void;
  expandedNodes: Record<string, boolean>;
  onToggleNode: (pathKey: string) => void;
  positionsByLocation: Record<string, string[]>;
}> = ({ name, data, level, path, selectedNode, onSelectNode, expandedNodes, onToggleNode, positionsByLocation }) => {
  const pathKey = path.join('>');
  const isExpanded = expandedNodes[pathKey] ?? false;
  const isSelected = selectedNode?.path.join('>') === pathKey;
  const children = typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.keys(data).sort() : Array.isArray(data) ? data.sort() : [];
  const hasChildren = children.length > 0;
  const positions = positionsByLocation[pathKey] || [];

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleNode(pathKey);
  };
  
  const handleSelect = () => {
    onSelectNode({ name, level, path });
  };

  return (
    <li>
      <div className={`tree-node-content ${isSelected ? 'selected' : ''}`} onClick={handleSelect}>
        {hasChildren && (
          <div className={`tree-node-toggler ${isExpanded ? 'expanded' : ''}`} onClick={handleToggle}>
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        )}
        <span style={{ marginLeft: hasChildren ? '0' : '24px' }}>{name}</span>
        {positions.length > 0 && (
            <div className="flex items-center gap-1 ml-2">
                {positions.map(pos => <IconForPosition key={pos} position={pos} />)}
            </div>
        )}
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {children.map((key: any) => (
            <TreeNode
              key={key}
              name={key}
              data={level === 0 ? data[key] : data[key]}
              level={level + 1}
              path={[...path, key]}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              expandedNodes={expandedNodes}
              onToggleNode={onToggleNode}
              positionsByLocation={positionsByLocation}
            />
          ))}
        </ul>
      )}
    </li>
  );
};


const GovernmentStructure: React.FC<GovernmentStructureProps> = ({ allVotingEntries }) => {
  const [historicalStructures, setHistoricalStructures] = useState<HistoricalStructure[]>([]);
  const [activeStructureId, setActiveStructureId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyticsNonce, setAnalyticsNonce] = useState(0);
  const [chartType, setChartType] = useState<ChartType>('distribution');
  const [chartDesign, setChartDesign] = useState<ChartDesign>('pie');

  const refreshAnalytics = useCallback(() => {
    setAnalyticsNonce(n => n + 1);
  }, []);

  useEffect(() => {
    const loadStructures = async () => {
      setIsLoading(true);
      try {
        await votingDB.openDb();
        const structures = await votingDB.getAllStructures();
        structures.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setHistoricalStructures(structures);
        if (structures.length > 0) {
          setActiveStructureId(structures[0].id);
        }
      } catch (e) {
        console.error("Failed to load structures from DB:", e);
        setError("Could not load government structures.");
      } finally {
        setIsLoading(false);
      }
    };
    loadStructures();
  }, []);

  const activeStructure = useMemo(() => {
    if (!activeStructureId) return null;
    return historicalStructures.find(s => s.id === activeStructureId)?.structure || null;
  }, [activeStructureId, historicalStructures]);

  const officialVoters = useMemo(() => allVotingEntries.filter(
    e => e.validationStatus === ValidationStatus.APPROVED && e.isOfficial
  ), [allVotingEntries]);
  
  const voterLocationMap = useMemo(() => {
    if (!activeStructure) return new Map<string, string[]>();

    const locationMap = new Map<string, string[]>();
    const allLocations: { name: string; path: string[] }[] = [];
    Object.keys(activeStructure).forEach(region => {
      allLocations.push({ name: region.toLowerCase(), path: [region] });
      Object.keys(activeStructure[region]).forEach(province => {
        allLocations.push({ name: province.toLowerCase(), path: [region, province] });
        activeStructure[region][province].forEach(city => {
          allLocations.push({ name: city.toLowerCase(), path: [region, province, city] });
        });
      });
    });

    officialVoters.forEach(voter => {
      const address = voter.idCardData.address?.toLowerCase();
      if (!address) return;
      let bestMatch: { name: string; path: string[] } | null = null;
      for (const loc of allLocations) {
        if (address.includes(loc.name)) {
          if (!bestMatch || loc.path.length > bestMatch.path.length) {
            bestMatch = loc;
          }
        }
      }
      if (bestMatch) {
        locationMap.set(voter.id, bestMatch.path);
      }
    });
    return locationMap;
  }, [activeStructure, officialVoters, analyticsNonce]);

  const positionsByLocation = useMemo(() => {
    const positionsMap: Record<string, string[]> = {};
    if (!activeStructure) return {};

    officialVoters.forEach(voter => {
      const path = voterLocationMap.get(voter.id);
      if (path && voter.assignedPosition) {
        for (let i = 1; i <= path.length; i++) {
          const partialPathKey = path.slice(0, i).join('>');
          if (!positionsMap[partialPathKey]) {
            positionsMap[partialPathKey] = [];
          }
          if (!positionsMap[partialPathKey].includes(voter.assignedPosition)) {
            positionsMap[partialPathKey].push(voter.assignedPosition);
          }
        }
      }
    });
    return positionsMap;
  }, [activeStructure, officialVoters, voterLocationMap]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = window.XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("The XLSX file contains no sheets.");
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const parsedStructure = parseSheetData(jsonData);
        
        const newRecord: HistoricalStructure = {
            id: `${new Date().getTime()}-${file.name}`,
            timestamp: new Date().toISOString(),
            filename: file.name,
            structure: parsedStructure,
        };

        await votingDB.addStructure(newRecord);
        setHistoricalStructures(prev => [newRecord, ...prev]);
        setActiveStructureId(newRecord.id);
        setSelectedNode(null);
        setExpandedNodes({});

      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("An unknown error occurred while parsing the file.");
      }
    };
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsArrayBuffer(file);
    if(event.target) event.target.value = '';
  };
  
  const handleDeleteStructure = async () => {
    if (!activeStructureId) return;
    try {
        await votingDB.deleteStructure(activeStructureId);
        const remaining = historicalStructures.filter(s => s.id !== activeStructureId);
        setHistoricalStructures(remaining);
        setActiveStructureId(remaining.length > 0 ? remaining[0].id : null);
        setSelectedNode(null);
    } catch(e) {
        console.error("Failed to delete structure:", e);
        setError("Could not delete the selected structure record.");
    } finally {
        setIsDeleteModalOpen(false);
    }
  };

  const onToggleNode = useCallback((pathKey: string) => {
    setExpandedNodes(prev => ({ ...prev, [pathKey]: !prev[pathKey] }));
  }, []);

  const votersForSelectedNode = useMemo(() => {
    if (!selectedNode || !activeStructure || officialVoters.length === 0) return [];
    const pathKey = selectedNode.path.join('>');
    
    if (selectedNode.level === 2) {
      return officialVoters.filter(v => voterLocationMap.get(v.id)?.join('>') === pathKey);
    }
    
    return officialVoters.filter(v => {
        const voterPath = voterLocationMap.get(v.id)?.join('>');
        return voterPath?.startsWith(pathKey);
    });
  }, [selectedNode, activeStructure, officialVoters, voterLocationMap]);

  const distributionChartData = useMemo(() => {
    if (!selectedNode || !activeStructure || votersForSelectedNode.length === 0 || selectedNode.level >= 2) {
      return null;
    }
    const pathKey = selectedNode.path.join('>');

    if (selectedNode.level === 0) { // Region
      const provinces = activeStructure[selectedNode.name] ? Object.keys(activeStructure[selectedNode.name]) : [];
      const data = provinces.map(province => {
        const provincePathKey = `${pathKey}>${province}`;
        const count = votersForSelectedNode.filter(v => voterLocationMap.get(v.id)?.join('>')?.startsWith(provincePathKey)).length;
        return { label: province, value: count };
      }).filter(item => item.value > 0);
      return { data, title: `Voter Distribution in ${selectedNode.name}` };
    }
    
    if (selectedNode.level === 1) { // Province
      const [region, province] = selectedNode.path;
      const cities = activeStructure[region]?.[province] || [];
      const data = cities.map(city => {
        const cityPathKey = `${pathKey}>${city}`;
        const count = votersForSelectedNode.filter(v => voterLocationMap.get(v.id)?.join('>') === cityPathKey).length;
        return { label: city, value: count };
      }).filter(item => item.value > 0);
      return { data, title: `Voter Distribution in ${selectedNode.name}` };
    }

    return null;
  }, [selectedNode, activeStructure, votersForSelectedNode, voterLocationMap]);

  const positionChartData = useMemo(() => {
    if (!selectedNode || votersForSelectedNode.length === 0) return null;

    const positionCounts = votersForSelectedNode.reduce((acc, voter) => {
        if (voter.assignedPosition) {
            acc[voter.assignedPosition] = (acc[voter.assignedPosition] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);
    
    const data = Object.entries(positionCounts).map(([label, value]) => ({ label, value }));

    if (data.length === 0) return null;

    return { data, title: `Assigned Positions in ${selectedNode.name}` };
  }, [selectedNode, votersForSelectedNode]);


  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
      <h3 className="text-xl font-semibold mb-2">Government Structure & Voter Analytics</h3>
      <p className="text-sm text-gray-500 mb-4">Upload and select a historical structure to see a graphical breakdown of official voters.</p>
      
      <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-4 mb-6">
        <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
          Upload New Structure
        </Button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />
        
        {historicalStructures.length > 0 && (
            <>
                <select 
                    value={activeStructureId ?? ''} 
                    onChange={e => { setActiveStructureId(e.target.value); setSelectedNode(null); }}
                    className="flex-grow block w-full sm:w-auto px-3 py-2 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card"
                    aria-label="Select a historical government structure"
                >
                    {historicalStructures.map(s => (
                        <option key={s.id} value={s.id}>
                            {new Date(s.timestamp).toLocaleString()} - {s.filename}
                        </option>
                    ))}
                </select>
                <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)}>
                    Delete Selected
                </Button>
            </>
        )}
      </div>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}
      
      {isLoading ? (
        <div className="text-center py-10"><LoadingSpinner /></div>
      ) : !activeStructure ? (
        <div className="text-center py-10 border-2 border-dashed border-theme-border rounded-lg">
          <p className="text-gray-500">No government structure loaded.</p>
          <p className="text-sm text-gray-400 mt-1">Please upload a valid XLSX file to begin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 tree-container border border-theme-border p-4 rounded-md h-96 overflow-auto">
                <ul>
                    {Object.keys(activeStructure).sort().map(regionName => (
                        <TreeNode
                            key={regionName}
                            name={regionName}
                            data={activeStructure[regionName]}
                            level={0}
                            path={[regionName]}
                            selectedNode={selectedNode}
                            onSelectNode={setSelectedNode}
                            expandedNodes={expandedNodes}
                            onToggleNode={onToggleNode}
                            positionsByLocation={positionsByLocation}
                        />
                    ))}
                </ul>
            </div>
            <div className="md:col-span-2 border border-theme-border p-4 rounded-md">
                {selectedNode ? (
                    <div>
                        <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
                            <div>
                                <h4 className="text-lg font-bold text-theme-primary">{selectedNode.name}</h4>
                                <p className="text-sm text-gray-500">
                                    {selectedNode.path.join(' / ')}
                                </p>
                            </div>
                            <div className="flex items-end gap-2 text-sm">
                                <div>
                                    <label htmlFor="chartType" className="block text-xs font-medium text-theme-text mb-1">Chart Type</label>
                                    <select
                                        id="chartType"
                                        value={chartType}
                                        onChange={(e) => setChartType(e.target.value as ChartType)}
                                        className="block w-full px-2 py-1 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card"
                                    >
                                        <option value="distribution">Distribution</option>
                                        <option value="positions">Positions</option>
                                        <option value="gender">Gender</option>
                                    </select>
                                </div>
                                {chartType === 'distribution' && (
                                    <div>
                                        <label htmlFor="chartDesign" className="block text-xs font-medium text-theme-text mb-1">Design</label>
                                        <select
                                            id="chartDesign"
                                            value={chartDesign}
                                            onChange={(e) => setChartDesign(e.target.value as ChartDesign)}
                                            className="block w-full px-2 py-1 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card"
                                        >
                                            <option value="pie">Pie</option>
                                            <option value="doughnut">Doughnut</option>
                                            <option value="3d">3D</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {votersForSelectedNode.length > 0 ? (
                            <>
                                {chartType === 'distribution' && (
                                    distributionChartData && distributionChartData.data.length > 0 ? (
                                        <PieChart data={distributionChartData.data} title={distributionChartData.title} design={chartDesign} />
                                    ) : (
                                        <div className="flex items-center justify-center h-48">
                                            <p className="text-gray-500 text-center">Voter distribution chart is not available for this level or there is no data.</p>
                                        </div>
                                    )
                                )}
                                {chartType === 'positions' && (
                                    positionChartData && positionChartData.data.length > 0 ? (
                                        <PositionBarChart data={positionChartData.data} title={positionChartData.title} />
                                    ) : (
                                        <div className="flex items-center justify-center h-48">
                                            <p className="text-gray-500 text-center">No assigned position data to display for this selection.</p>
                                        </div>
                                    )
                                )}
                                {chartType === 'gender' && (
                                    <GenderStats voters={votersForSelectedNode} />
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-48">
                                <p className="text-gray-500 text-center">No official voter data to display for this selection.</p>
                            </div>
                        )}
                        <div className="text-center mt-4 border-t border-theme-border pt-4">
                            <Button variant="secondary" size="sm" onClick={refreshAnalytics} className="inline-flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.181-3.183m-4.992-11.667a8.25 8.25 0 010 11.667l-3.181 3.183m0 0v4.992m0 0h-4.992" />
                                </svg>
                                Refresh Analytics
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500">Select a location from the tree to see analytics.</p>
                    </div>
                )}
            </div>
        </div>
      )}
       <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
            <div className="p-4">
                <p className="mb-6">Are you sure you want to delete this structure record? This action is irreversible.</p>
                <div className="flex justify-end space-x-3">
                    <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                    <Button variant="danger" onClick={handleDeleteStructure}>Delete</Button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default GovernmentStructure;