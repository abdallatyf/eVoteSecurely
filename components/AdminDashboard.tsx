

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// Fix: Import ChartType and ChartDesign from types.ts to break circular dependency.
import { VotingEntry, ValidationStatus, Theme, AdminUser, AdminRole, IDCardData, ChartType, ChartDesign } from '../types';
import AdminValidationPanel from './AdminValidationPanel';
import VotingEventCard from './VotingEventCard';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import Button from './Button';
import Input from './Input'; // Import Input for the form
import LoadingSpinner from './LoadingSpinner'; // Import LoadingSpinner
import Modal from './Modal'; // Import Modal
import { THEMES, CONSTITUTIONAL_POSITIONS, themeColorMapping, ADMIN_ROLES } from '../constants';
import { calculateFacialSymmetry, escapeCSV } from '../utils/dataExportUtils'; // Import from utility
import { votingDB } from '../services/dbService'; // Import the IndexedDB service
import GovernmentStructure from './GovernmentStructure';
import ManualEntryForm from './ManualEntryForm';
import DatabaseUsagePanel from './DatabaseUsagePanel';

interface AdminDashboardProps {
  allVotingEntries: VotingEntry[];
  onUpdateEntry: (updatedEntry: VotingEntry) => void;
  onClearAllEntries: () => void; // Add prop for clearing all entries
  onAddEntry: (idCardData: IDCardData) => Promise<VotingEntry>;
}

type AdminTab = 'management' | 'validation' | 'manualEntry' | 'settings' | 'structure';
// Fix: Removed ChartType and ChartDesign definitions to break circular dependency. They are now imported from ../types.

const AdminDashboard: React.FC<AdminDashboardProps> = ({ allVotingEntries, onUpdateEntry, onClearAllEntries, onAddEntry }) => {
  const { loggedInAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    // Default Validators to the validation queue
    return loggedInAdmin?.role === AdminRole.VALIDATOR ? 'validation' : 'management';
  });
  const [validatedVoteCount, setValidatedVoteCount] = useState<number>(0);
  const [pendingEntries, setPendingEntries] = useState<VotingEntry[]>([]);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);

  // Filtering and sorting states
  const [filterStatus, setFilterStatus] = useState<ValidationStatus | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'fullName' | 'timestamp' | 'validationStatus'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Create Admin User states
  const [isCreateAdminModalOpen, setIsCreateAdminModalOpen] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminFullName, setNewAdminFullName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>(AdminRole.VALIDATOR); // Default to validator
  const [newAdminUsernameError, setNewAdminUsernameError] = useState<string | null>(null);
  const [newAdminPasswordError, setNewAdminPasswordError] = useState<string | null>(null);
  const [newAdminFullNameError, setNewAdminFullNameError] = useState<string | null>(null);
  const [createAdminSuccessMessage, setCreateAdminSuccessMessage] = useState<string | null>(null);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  // Assign position states
  const [entryToAssignPosition, setEntryToAssignPosition] = useState<VotingEntry | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  
  // Settings states
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('settings-autoSaveManualEntry');
    return saved === null ? true : saved === 'true'; // Default to true
  });
  const [allowContactEditing, setAllowContactEditing] = useState<boolean>(() => {
    const saved = localStorage.getItem('settings-allowContactEditing');
    return saved === 'true'; // Default to false
  });
  const [votingEventDate, setVotingEventDate] = useState<string>(() => {
    return localStorage.getItem('settings-votingEventDate') || '';
  });

  const TOTAL_DB_CAPACITY = 120000000;

  useEffect(() => {
    const approved = allVotingEntries.filter(entry => entry.validationStatus === ValidationStatus.APPROVED);
    setValidatedVoteCount(approved.length);

    const pending = allVotingEntries.filter(entry => entry.validationStatus === ValidationStatus.PENDING);
    setPendingEntries(pending);
  }, [allVotingEntries]);

  // Effect to persist settings to localStorage
  useEffect(() => {
    localStorage.setItem('settings-autoSaveManualEntry', String(autoSaveEnabled));
  }, [autoSaveEnabled]);

  useEffect(() => {
    localStorage.setItem('settings-allowContactEditing', String(allowContactEditing));
  }, [allowContactEditing]);

  useEffect(() => {
    localStorage.setItem('settings-votingEventDate', votingEventDate);
  }, [votingEventDate]);

  const filteredAndSortedEntries = useMemo(() => {
    let entries = [...allVotingEntries];

    if (filterStatus !== 'ALL') {
      entries = entries.filter(entry => entry.validationStatus === filterStatus);
    }

    entries.sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (sortBy) {
        case 'fullName':
          valA = a.idCardData.fullName.toLowerCase();
          valB = b.idCardData.fullName.toLowerCase();
          break;
        case 'timestamp':
          valA = new Date(a.timestamp).getTime();
          valB = new Date(b.timestamp).getTime();
          break;
        case 'validationStatus':
          const statusOrder = { [ValidationStatus.PENDING]: 0, [ValidationStatus.REJECTED]: 1, [ValidationStatus.APPROVED]: 2 };
          valA = statusOrder[a.validationStatus];
          valB = statusOrder[b.validationStatus];
          break;
        default: return 0;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });

    return entries;
  }, [allVotingEntries, filterStatus, sortBy, sortOrder]);


  const handleValidateEntry = useCallback((entryId: string, status: ValidationStatus, reason?: string) => {
    const entryToUpdate = allVotingEntries.find(entry => entry.id === entryId);
    if (entryToUpdate && loggedInAdmin) {
      const updatedEntry: VotingEntry = {
        ...entryToUpdate,
        validationStatus: status,
        validatedBy: loggedInAdmin.id,
        validationTimestamp: new Date().toISOString(),
        rejectionReason: status === ValidationStatus.REJECTED ? reason : undefined,
      };
      if (status === ValidationStatus.REJECTED) {
        updatedEntry.assignedPosition = undefined;
      }
      onUpdateEntry(updatedEntry);
    }
  }, [allVotingEntries, loggedInAdmin, onUpdateEntry]);

  const handleClearAllConfirm = useCallback(() => {
    onClearAllEntries();
    setIsClearAllModalOpen(false);
  }, [onClearAllEntries]);

  const handleExportCSV = useCallback(() => {
    const validatedEntries = allVotingEntries.filter(e => e.validationStatus === ValidationStatus.APPROVED);
    if (validatedEntries.length === 0) {
      alert('No validated entries to export.');
      return;
    }

    const headers = ['Entry ID', 'Full Name', 'ID Number', 'Contact Number', 'Date of Birth', 'Country', 'Issue Date', 'Expiry Date', 'Address', 'Gender', 'Assigned Position', 'Facial Description', 'Other Text', 'QR Code Data', 'Gemini Confidence (%)', 'Facial Symmetry Score (%)', 'Facial Symmetry Quality', 'Validation Status', 'Validated By', 'Validation Timestamp', 'Submission Timestamp'];
    const csvRows = [headers.map(escapeCSV).join(',')];

    validatedEntries.forEach((entry) => {
      const { id, idCardData, timestamp, validationStatus, validatedBy, validationTimestamp, assignedPosition } = entry;
      const { fullName, dob, idNumber, contactNumber, country, issueDate, expiryDate, address, gender, facialDescription, otherText, qrCodeData, confidenceScore, facialLandmarks } = idCardData;
      const symmetryResult = facialLandmarks ? calculateFacialSymmetry(facialLandmarks) : { score: 'N/A', quality: 'N/A' };
      
      const row = [
        id, fullName, idNumber, contactNumber || 'N/A', dob, country, 
        issueDate || 'N/A',
        expiryDate || 'N/A',
        address || 'N/A',
        gender || 'N/A',
        assignedPosition || 'Not Assigned', facialDescription, otherText || 'N/A', qrCodeData || 'N/A',
        confidenceScore !== undefined ? (confidenceScore * 100).toFixed(2) : 'N/A',
        typeof symmetryResult.score === 'number' ? symmetryResult.score.toFixed(0) : symmetryResult.score,
        symmetryResult.quality, validationStatus.toUpperCase(), validatedBy || 'N/A',
        validationTimestamp ? new Date(validationTimestamp).toLocaleString() : 'N/A',
        new Date(timestamp).toLocaleString(),
      ].map(val => escapeCSV(String(val)));
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `validated_voting_entries_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [allVotingEntries]);

  const getStatusBadgeClass = (status: ValidationStatus) => ({
    [ValidationStatus.PENDING]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100',
    [ValidationStatus.APPROVED]: 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100',
    [ValidationStatus.REJECTED]: 'bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-100',
  })[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';

  const handleCreateAdminUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingAdmin(true);
    setNewAdminUsernameError(null); setNewAdminPasswordError(null); setNewAdminFullNameError(null);
    setCreateAdminSuccessMessage(null);
    let hasError = false;
    if (!newAdminUsername.trim() || newAdminUsername.trim().length < 4) { setNewAdminUsernameError('Username must be at least 4 characters.'); hasError = true; }
    if (!newAdminPassword.trim() || newAdminPassword.trim().length < 8) { setNewAdminPasswordError('Password must be at least 8 characters.'); hasError = true; }
    if (!newAdminFullName.trim() || newAdminFullName.trim().length < 3) { setNewAdminFullNameError('Full Name must be at least 3 characters.'); hasError = true; }
    if (hasError) { setIsCreatingAdmin(false); return; }

    try {
      await votingDB.openDb();
      if (await votingDB.getAdminUser(newAdminUsername.trim())) {
        setNewAdminUsernameError('Username already exists.');
        setIsCreatingAdmin(false); return;
      }
      const newAdmin: AdminUser = {
        id: `admin_${Date.now()}`,
        username: newAdminUsername.trim(),
        passwordHash: newAdminPassword.trim(),
        fullName: newAdminFullName.trim(),
        role: newAdminRole,
      };
      await votingDB.addAdminUser(newAdmin);
      setCreateAdminSuccessMessage(`Admin user "${newAdmin.username}" with role "${newAdmin.role}" created successfully!`);
      setNewAdminUsername(''); setNewAdminPassword(''); setNewAdminFullName('');
    } catch (error) {
      console.error('Error creating new admin user:', error);
      setNewAdminUsernameError('Failed to create admin user. Please try again.');
    } finally {
      setIsCreatingAdmin(false); }
  }, [newAdminUsername, newAdminPassword, newAdminFullName, newAdminRole]);

  const handleCloseCreateAdminModal = useCallback(() => {
    setIsCreateAdminModalOpen(false);
    setNewAdminUsername(''); setNewAdminPassword(''); setNewAdminFullName('');
    setNewAdminRole(AdminRole.VALIDATOR);
    setNewAdminUsernameError(null); setNewAdminPasswordError(null); setNewAdminFullNameError(null);
    setCreateAdminSuccessMessage(null);
  }, []);

  const handleOpenAssignModal = useCallback((entry: VotingEntry) => {
    setEntryToAssignPosition(entry);
    // Note: The actual selected position is now set via useEffect to handle filtering
  }, []);

  const handleCloseAssignModal = useCallback(() => {
    setEntryToAssignPosition(null); setSelectedPosition('');
  }, []);
  
  const filteredPositions = useMemo(() => {
    if (!entryToAssignPosition?.idCardData?.address) {
        return CONSTITUTIONAL_POSITIONS;
    }
    const address = entryToAssignPosition.idCardData.address.toLowerCase();

    const national = ['President', 'Vice President', 'Senator', 'Representative'];
    const provincial = ['Governor', 'Vice Governor', 'Provincial Board Member'];
    const city = ['Mayor', 'Vice Mayor', 'City Councilor'];
    const municipal = ['Mayor', 'Vice Mayor', 'Municipal Councilor'];

    let relevantPositions = [...national];

    if (address.includes('city')) {
        relevantPositions.push(...city);
    }
    if (address.includes('municipality') || address.includes('municipal')) {
        relevantPositions.push(...municipal);
    }
    if (address.includes('province')) {
        relevantPositions.push(...provincial);
    }

    // Fallback: If no local-level keywords are found, show all positions to be safe.
    if (relevantPositions.length === national.length) {
        return CONSTITUTIONAL_POSITIONS;
    }
    
    return [...new Set(relevantPositions)];
  }, [entryToAssignPosition]);

  useEffect(() => {
    if (entryToAssignPosition && filteredPositions) {
        const currentPosition = entryToAssignPosition.assignedPosition;
        if (currentPosition && filteredPositions.includes(currentPosition)) {
            setSelectedPosition(currentPosition);
        } else {
            setSelectedPosition(''); // Reset if current position isn't in the filtered list or doesn't exist.
        }
    }
  }, [entryToAssignPosition, filteredPositions]);

  const handleAssignPositionSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!entryToAssignPosition || !selectedPosition) {
      alert("Please select a valid position."); return;
    }
    const updatedEntry: VotingEntry = { ...entryToAssignPosition, assignedPosition: selectedPosition, isOfficial: false };
    onUpdateEntry(updatedEntry);
    handleCloseAssignModal();
  }, [entryToAssignPosition, selectedPosition, onUpdateEntry, handleCloseAssignModal]);

  const handleToggleOfficialStatus = useCallback((entryId: string) => {
    const entryToUpdate = allVotingEntries.find(entry => entry.id === entryId);
    if (entryToUpdate) {
      onUpdateEntry({ ...entryToUpdate, isOfficial: !entryToUpdate.isOfficial });
    }
  }, [allVotingEntries, onUpdateEntry]);
  
  const handleManualEntryAdded = useCallback(() => {
    // Switch to the management tab to show the newly added entry
    setActiveTab('management');
  }, []);

  const TabButton: React.FC<{ tabName: AdminTab; label: string; count?: number }> = ({ tabName, label, count }) => (
    <button
      onClick={() => setActiveTab(tabName)}
      className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200
        ${activeTab === tabName
          ? 'border-theme-primary text-theme-primary'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-200'}
      `}
      aria-current={activeTab === tabName ? 'page' : undefined}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none rounded-full
          ${activeTab === tabName ? 'bg-theme-primary text-white' : 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-slate-200'}`}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-theme-background text-theme-text p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
            <div className="flex justify-center items-center gap-4 mb-1">
                <h2 className="text-3xl font-bold">Admin Dashboard</h2>
                <div className="flex items-center gap-2" role="radiogroup" aria-label="Select App Theme">
                    {THEMES.map((t) => (
                      <button
                        key={t}
                        role="radio"
                        aria-checked={theme === t}
                        onClick={() => setTheme(t)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          theme === t ? 'border-theme-primary scale-110' : 'border-transparent hover:border-gray-400'
                        }`}
                        title={`Switch to ${t} theme`}
                        aria-label={`Switch to ${t} theme`}
                      >
                        <div className={`w-full h-full rounded-full ${themeColorMapping[t]}`} />
                      </button>
                    ))}
                </div>
            </div>
            <p className="text-lg text-gray-500">Welcome, {loggedInAdmin?.fullName} ({loggedInAdmin?.role})!</p>
        </div>
        
        <div className="border-b border-theme-border">
          <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
            <TabButton tabName="management" label="Entry Management" />
            <TabButton tabName="validation" label="Validation Queue" count={pendingEntries.length} />
            <TabButton tabName="manualEntry" label="Manual Entry" />
            {loggedInAdmin?.role === AdminRole.SUPER_ADMIN && (
              <>
                <TabButton tabName="structure" label="Government Structure" />
                <TabButton tabName="settings" label="Dashboard & Settings" />
              </>
            )}
          </nav>
        </div>

        <div>
          {activeTab === 'management' && (
            <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
              <h3 className="text-xl font-semibold mb-4">All Voting Entries</h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                <div className="flex-1">
                  <label htmlFor="filterStatus" className="block text-sm font-medium mb-1">Filter by Status:</label>
                  <select id="filterStatus" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card">
                    <option value="ALL">All</option>
                    <option value={ValidationStatus.PENDING}>Pending</option>
                    <option value={ValidationStatus.APPROVED}>Approved</option>
                    <option value={ValidationStatus.REJECTED}>Rejected</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="sortBy" className="block text-sm font-medium mb-1">Sort By:</label>
                  <select id="sortBy" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card">
                    <option value="timestamp">Submission Date</option>
                    <option value="fullName">Full Name</option>
                    <option value="validationStatus">Validation Status</option>
                  </select>
                </div>
                <div className="flex-shrink-0 mt-2 sm:mt-0">
                  <label className="block text-sm font-medium mb-1">Order:</label>
                  <Button onClick={() => setSortOrder(p => p === 'asc' ? 'desc' : 'asc')} variant="secondary" size="sm" className="w-full sm:w-auto">
                    {sortOrder === 'asc' ? 'ASC' : 'DESC'}
                  </Button>
                </div>
              </div>
              {filteredAndSortedEntries.length === 0 ? (
                <p className="text-center text-gray-500">No entries match your criteria.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-theme-border">
                    <thead className="bg-theme-table-header">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-theme-table-header">Full Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-theme-table-header">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-theme-table-header">Assigned Position</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-theme-table-header">Official Record</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-theme-table-header">ID Number</th>
                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-theme-table-header">AI Confidence (%)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-theme-table-header">Submission Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-theme-border">
                      {filteredAndSortedEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <span>{entry.idCardData.fullName}</span>
                              {entry.idCardData.confidenceScore !== undefined && entry.idCardData.confidenceScore < 0.7 && (
                                <div className="flex-shrink-0" title={`Low AI extraction confidence: ${(entry.idCardData.confidenceScore * 100).toFixed(0)}%. Please review carefully.`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(entry.validationStatus)}`}>{entry.validationStatus.toUpperCase()}</span>
                              {entry.validationStatus === ValidationStatus.REJECTED && entry.rejectionReason && (
                                <div className="group relative inline-block ml-2 align-middle">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                  <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 pointer-events-none">
                                    <strong>Reason:</strong> {entry.rejectionReason}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {entry.validationStatus === ValidationStatus.APPROVED ? (
                              entry.assignedPosition ? (
                                <div className="flex items-center space-x-2">
                                  <span>{entry.assignedPosition}</span>
                                  <Button onClick={() => handleOpenAssignModal(entry)} variant="secondary" size="sm" className="!py-0.5 !px-2" disabled={entry.isOfficial}>Change</Button>
                                </div>
                              ) : <Button onClick={() => handleOpenAssignModal(entry)} variant="primary" size="sm">Assign</Button>
                            ) : <span className="text-gray-400">N/A</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {entry.validationStatus === ValidationStatus.APPROVED ? (
                                <div className="flex items-center gap-2">
                                <label
                                    htmlFor={`toggle-official-${entry.id}`}
                                    className={`flex items-center ${loggedInAdmin?.role !== AdminRole.SUPER_ADMIN ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                    title={
                                    loggedInAdmin?.role !== AdminRole.SUPER_ADMIN
                                    ? "Only Super Admins can modify official status."
                                    : (entry.isOfficial ? "Mark as unofficial" : "Mark as official voter")
                                    }
                                >
                                    <div className="relative">
                                    <input
                                        id={`toggle-official-${entry.id}`}
                                        type="checkbox"
                                        className="sr-only"
                                        checked={entry.isOfficial ?? false}
                                        onChange={() => handleToggleOfficialStatus(entry.id)}
                                        disabled={loggedInAdmin?.role !== AdminRole.SUPER_ADMIN}
                                    />
                                    <div className={`block w-10 h-6 rounded-full transition ${entry.isOfficial ? 'bg-theme-primary' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${entry.isOfficial ? 'translate-x-full' : ''}`}></div>
                                    </div>
                                </label>
                                {entry.isOfficial && (
                                    <span
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100"
                                    title="This is an official, saved record."
                                    >
                                    Official
                                    </span>
                                )}
                                </div>
                            ) : <span className="text-gray-400">N/A</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{entry.idCardData.idNumber}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                            {entry.idCardData.confidenceScore !== undefined ? (
                              <span
                                className={
                                  entry.idCardData.confidenceScore < 0.7 ? 'text-yellow-500 font-semibold' :
                                  entry.idCardData.confidenceScore < 0.85 ? 'text-gray-400' : ''
                                }
                              >
                                {(entry.idCardData.confidenceScore * 100).toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(entry.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {activeTab === 'validation' && (
            <AdminValidationPanel pendingEntries={pendingEntries} onValidateEntry={handleValidateEntry} />
          )}
          {activeTab === 'manualEntry' && (
            <ManualEntryForm onAddEntry={onAddEntry} onEntryAdded={handleManualEntryAdded} />
          )}
          {activeTab === 'structure' && loggedInAdmin?.role === AdminRole.SUPER_ADMIN && (
             <div className="space-y-4">
                <GovernmentStructure 
                    allVotingEntries={allVotingEntries}
                />
             </div>
          )}
          {activeTab === 'settings' && loggedInAdmin?.role === AdminRole.SUPER_ADMIN && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <VotingEventCard validatedVoteCount={validatedVoteCount} votingEventDate={votingEventDate} />
                <DatabaseUsagePanel
                  currentEntryCount={allVotingEntries.length}
                  totalCapacity={TOTAL_DB_CAPACITY}
                />
              </div>

              <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
                <h3 className="text-xl font-semibold mb-4">Event Configuration</h3>
                <Input
                  label="Voting Event Date"
                  type="date"
                  value={votingEventDate}
                  onChange={(e) => setVotingEventDate(e.target.value)}
                  className="max-w-xs"
                />
                {votingEventDate && (
                  <div className="mt-6 border-t border-theme-border pt-4">
                    <p className="text-sm font-medium mb-2">Voter UI is enabled.</p>
                    <Button variant="secondary" onClick={() => window.open('#/?testMode=true', '_blank', 'noopener,noreferrer')}>
                      Test Voter UI
                    </Button>
                    <p className="text-xs text-gray-500 mt-2">
                      Click to open the voter-facing screen in a new tab to test the user experience.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
                <h3 className="text-xl font-semibold mb-4">App Theme Customization</h3>
                <div role="radiogroup" aria-label="Select App Theme" className="flex flex-wrap gap-4 justify-center sm:justify-start">
                  {THEMES.map((t) => (
                    <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`p-3 rounded-lg border-2 flex items-center space-x-2 transition-all ${theme === t ? 'border-theme-primary' : 'border-theme-border'}`}>
                      <div className={`w-5 h-5 rounded-full ${themeColorMapping[t]}`}></div>
                      <span className="capitalize text-sm font-medium">{t}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
                <h3 className="text-xl font-semibold mb-4">General Settings</h3>
                <div className="space-y-4">
                  <label htmlFor="toggle-auto-save" className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input id="toggle-auto-save" type="checkbox" className="sr-only" checked={autoSaveEnabled} onChange={() => setAutoSaveEnabled(!autoSaveEnabled)} />
                      <div className={`block w-10 h-6 rounded-full transition ${autoSaveEnabled ? 'bg-theme-primary' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
                      <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${autoSaveEnabled ? 'translate-x-full' : ''}`}></div>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm font-medium">Enable Manual Entry Auto-Save</p>
                        <p className="text-xs text-gray-500">{autoSaveEnabled ? 'Automatically saves a draft as you type.' : 'Auto-save is disabled.'}</p>
                    </div>
                  </label>
                  <label htmlFor="toggle-contact-edit" className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input id="toggle-contact-edit" type="checkbox" className="sr-only" checked={allowContactEditing} onChange={() => setAllowContactEditing(!allowContactEditing)} />
                      <div className={`block w-10 h-6 rounded-full transition ${allowContactEditing ? 'bg-theme-primary' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
                      <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${allowContactEditing ? 'translate-x-full' : ''}`}></div>
                    </div>
                     <div className="ml-3">
                        <p className="text-sm font-medium">Allow Contact Number Editing</p>
                        <p className="text-xs text-gray-500">{allowContactEditing ? 'Contact number can be changed in the "Edit Data" form.' : 'Contact number is read-only after initial scan.'}</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
                <h3 className="text-xl font-semibold mb-4">Data & User Management</h3>
                <div className="flex flex-wrap gap-4">
                  <Button variant="primary" onClick={handleExportCSV}>Export Validated CSV</Button>
                  <Button variant="primary" onClick={() => setIsCreateAdminModalOpen(true)}>Create New Admin</Button>
                  <Button variant="secondary" onClick={() => navigate('/')}>Fetch ID Card Data</Button>
                  <Button variant="danger" onClick={() => setIsClearAllModalOpen(true)}>Clear All Entries</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isClearAllModalOpen} onClose={() => setIsClearAllModalOpen(false)} title="Confirm Clear All Entries">
        <div className="p-4"><p className="mb-6">Are you sure you want to clear ALL entries? This is irreversible.</p><div className="flex justify-end space-x-3"><Button variant="secondary" onClick={() => setIsClearAllModalOpen(false)}>Cancel</Button><Button variant="danger" onClick={handleClearAllConfirm}>Clear All</Button></div></div>
      </Modal>
      <Modal isOpen={isCreateAdminModalOpen} onClose={handleCloseCreateAdminModal} title="Create New Admin User">
        <form onSubmit={handleCreateAdminUser} className="space-y-4 p-2">
            {createAdminSuccessMessage && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{createAdminSuccessMessage}</div>}
            <Input label="Username" type="text" value={newAdminUsername} onChange={(e) => setNewAdminUsername(e.target.value)} required error={newAdminUsernameError} />
            <Input label="Password" type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} required error={newAdminPasswordError} />
            <Input label="Full Name" type="text" value={newAdminFullName} onChange={(e) => setNewAdminFullName(e.target.value)} required error={newAdminFullNameError} />
            <div>
              <label htmlFor="admin-role" className="block text-sm font-medium text-theme-text mb-1">Role</label>
              <select
                id="admin-role"
                value={newAdminRole}
                onChange={(e) => setNewAdminRole(e.target.value as AdminRole)}
                className="block w-full px-3 py-2 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card text-theme-text"
              >
                {ADMIN_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-2 mt-6"><Button type="button" variant="secondary" onClick={handleCloseCreateAdminModal} disabled={isCreatingAdmin}>Cancel</Button><Button type="submit" variant="primary" disabled={isCreatingAdmin}>{isCreatingAdmin ? <LoadingSpinner /> : 'Create'}</Button></div>
        </form>
      </Modal>
      <Modal isOpen={!!entryToAssignPosition} onClose={handleCloseAssignModal} title={`Assign Position to ${entryToAssignPosition?.idCardData.fullName}`}>
        <form onSubmit={handleAssignPositionSubmit} className="space-y-4 p-2">
            <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md">
                <p className="text-sm font-semibold">Voter's Address:</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">{entryToAssignPosition?.idCardData.address || 'Not available'}</p>
            </div>
            <p className="text-sm text-gray-500">Select a constitutional position for this candidate based on their address.</p>
            <div>
              <label htmlFor="position-select" className="block text-sm font-medium mb-1">Position</label>
              <select id="position-select" value={selectedPosition} onChange={(e) => setSelectedPosition(e.target.value)} required className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-theme-primary sm:text-sm bg-theme-card">
                <option value="" disabled>-- Select a Position --</option>
                {filteredPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
              </select>
            </div>
            <div className="flex justify-end space-x-2 mt-6"><Button type="button" variant="secondary" onClick={handleCloseAssignModal}>Cancel</Button><Button type="submit" variant="primary">Save</Button></div>
        </form>
      </Modal>
    </div>
  );
};

export default AdminDashboard;