import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HashRouter as Router, Route, Routes, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import IDScanner from './components/IDScanner';
import ExtractedIDData from './components/ExtractedIDData';
import AdminDashboard from './components/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import Button from './components/Button';
import Input from './components/Input';
import LoadingSpinner from './components/LoadingSpinner'; // Import LoadingSpinner
import VotingInterfaceUI from './components/VotingInterfaceUI'; // Import the new voting UI
import { VotingEntry, IDCardData, ValidationStatus, Theme, Candidate } from './types';
import { ADMIN_USERS, THEMES, themeColorMapping } from './constants'; // Import ADMIN_USERS for login page
import { votingDB } from './services/dbService'; // Import the IndexedDB service
import { generateQRCodeDataURL } from '../utils/dataExportUtils';

// A new component to display approved voters in test mode.
const PossibleVoters: React.FC<{
  voters: VotingEntry[];
  onVoterSelect: (entry: VotingEntry) => void;
}> = ({ voters, onVoterSelect }) => {
  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border text-theme-text">
      <h2 className="text-2xl font-bold mb-6 text-center text-theme-primary">Select Your Profile to Vote</h2>
      <p className="text-center text-sm text-gray-500 mb-6 -mt-4">This interface is for testing purposes. Select a voter to simulate the post-scan experience.</p>
      {voters.length === 0 ? (
        <p className="text-center text-gray-500 py-8">There are no voters currently approved and waiting to vote.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {voters.map((voter) => (
            <button
              key={voter.id}
              onClick={() => onVoterSelect(voter)}
              className="group flex flex-col items-center p-3 bg-theme-background rounded-lg border border-theme-border text-center hover:bg-theme-primary/10 hover:border-theme-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-theme-card focus:ring-theme-primary"
              aria-label={`Select voter ${voter.idCardData.fullName}`}
            >
              <img
                src={`data:${voter.idCardData.imageMimeType};base64,${voter.idCardData.base64Image}`}
                alt={`Photo of ${voter.idCardData.fullName}`}
                className="w-24 h-24 rounded-full object-cover border-2 border-theme-border group-hover:border-theme-primary transition-colors"
              />
              <p className="mt-3 font-semibold text-sm group-hover:text-theme-primary transition-colors">{voter.idCardData.fullName}</p>
              <p className="text-xs text-gray-500">ID: ...{voter.idCardData.idNumber.slice(-4)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// New component for access denied message in test mode
const TestModeAccessDenied: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="bg-theme-card p-8 rounded-lg shadow-lg text-center border border-theme-border">
      <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
      <p className="mb-6">You must be logged in as an administrator to use the Voter UI test mode.</p>
      <Button onClick={() => navigate('/admin-login')} variant="primary">
        Go to Admin Login
      </Button>
    </div>
  );
};

// Admin Login Component
const AdminLoginPage: React.FC = () => {
  const { login, isAdminAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdminAuthenticated) {
      navigate('/admin/dashboard');
    }
  }, [isAdminAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const success = await login(username, password);
    if (!success) {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-background p-4">
      <div className="relative bg-theme-card p-8 rounded-lg shadow-lg w-full max-w-md text-theme-text border border-theme-border">
        <div className="absolute top-4 right-4 flex space-x-2">
            {THEMES.map((t) => (
                <button
                    key={t}
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
        <h2 className="text-2xl font-bold text-center mb-6">Admin Login</h2>
        <form onSubmit={handleSubmit}>
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <Button type="submit" variant="primary" className="w-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
};

// Main App Component with Contexts
const App: React.FC = () => {
  const [allVotingEntries, setAllVotingEntries] = useState<VotingEntry[]>([]);
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [currentExtractedEntry, setCurrentExtractedEntry] = useState<VotingEntry | null>(null);
  const [idDataHistory, setIdDataHistory] = useState<IDCardData[]>([]); // New state for tracking IDCardData edits
  const [isLoadingApp, setIsLoadingApp] = useState<boolean>(true); // New loading state for the app

  // Create a persistent BroadcastChannel for this component instance to communicate with other tabs
  const channel = useMemo(() => new BroadcastChannel('voting-app-sync'), []);

  // Effect to listen for messages from other tabs/windows and sync state
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'ENTRY_ADDED': {
          const newEntry = payload as VotingEntry;
          setAllVotingEntries((prevEntries) => {
            if (prevEntries.some((e) => e.id === newEntry.id)) return prevEntries;
            return [...prevEntries, newEntry];
          });
          break;
        }
        case 'ENTRY_UPDATED': {
          const updatedEntry = payload as VotingEntry;
          setAllVotingEntries((prevEntries) =>
            prevEntries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
          );
          setCurrentExtractedEntry((prev) => (prev && prev.id === updatedEntry.id ? updatedEntry : prev));
          break;
        }
        case 'ALL_ENTRIES_CLEARED': {
          setAllVotingEntries([]);
          setCurrentExtractedEntry(null);
          setIdDataHistory([]);
          break;
        }
        case 'CANDIDATE_ADDED': {
            const newCandidate = payload as Candidate;
            setAllCandidates(prev => {
                if(prev.some(c => c.id === newCandidate.id)) return prev;
                return [...prev, newCandidate];
            });
            break;
        }
        case 'CANDIDATE_UPDATED': {
            const updatedCandidate = payload as Candidate;
            setAllCandidates(prev => prev.map(c => c.id === updatedCandidate.id ? updatedCandidate : c));
            break;
        }
        case 'CANDIDATE_DELETED': {
            const candidateId = payload as string;
            setAllCandidates(prev => prev.filter(c => c.id !== candidateId));
            break;
        }
        default:
          break;
      }
    };

    channel.addEventListener('message', handleMessage);

    // Cleanup listener and close channel when the app unmounts
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [channel]);

  // Load entries from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await votingDB.openDb(); // Ensure DB is open
        const [entries, candidates] = await Promise.all([
            votingDB.getAllEntries(),
            votingDB.getAllCandidates(),
        ]);
        setAllVotingEntries(entries);
        setAllCandidates(candidates);
      } catch (error) {
        console.error('Error loading data from IndexedDB:', error);
      } finally {
        setIsLoadingApp(false);
      }
    };
    loadData();
  }, []); // Run only once on mount

  const handleAddEntry = useCallback(async (idCardData: IDCardData): Promise<VotingEntry> => {
    const newEntryId = `entry-${Date.now()}`;
    
    const qrCodeText = JSON.stringify({
        entryId: newEntryId,
        idNumber: idCardData.idNumber,
        fullName: idCardData.fullName,
    });
    const qrCodeDataURL = await generateQRCodeDataURL(qrCodeText);
    const qrCodeBase64 = qrCodeDataURL.split(',')[1];

    const newEntry: VotingEntry = {
      id: newEntryId,
      idCardData: {
          ...idCardData,
          voterQRCodeBase64: qrCodeBase64,
      },
      timestamp: new Date().toISOString(),
      validationStatus: ValidationStatus.PENDING,
    };
    try {
      await votingDB.addEntry(newEntry);
      channel.postMessage({ type: 'ENTRY_ADDED', payload: newEntry });
      setAllVotingEntries((prevEntries) => [...prevEntries, newEntry]);
      return newEntry;
    } catch (error) {
      console.error('Error adding entry to IndexedDB:', error);
      throw error;
    }
  }, [channel]);

  const handleIDDataExtracted = useCallback(async (idCardData: IDCardData) => {
    const existingEntry = allVotingEntries.find(
        entry => entry.idCardData.idNumber === idCardData.idNumber && idCardData.idNumber.trim() !== ''
    );

    if (existingEntry) {
        setCurrentExtractedEntry(existingEntry);
    } else {
        const newEntry = await handleAddEntry(idCardData);
        setCurrentExtractedEntry(newEntry);
    }
    setIdDataHistory([]);
}, [allVotingEntries, handleAddEntry]);

  const handleClearCurrentEntry = useCallback(() => {
    setCurrentExtractedEntry(null);
    setIdDataHistory([]);
  }, []);

  const handleUpdateEntry = useCallback(async (updatedEntry: VotingEntry) => {
    try {
      await votingDB.updateEntry(updatedEntry);
      channel.postMessage({ type: 'ENTRY_UPDATED', payload: updatedEntry });
      setAllVotingEntries((prevEntries) =>
        prevEntries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
      );
    } catch (error) {
      console.error('Error updating entry in IndexedDB:', error);
    }
  }, [channel]);

  const handleUpdateCurrentExtractedIDData = useCallback(async (updatedIDCardData: IDCardData) => {
    if (!currentExtractedEntry) {
      throw new Error("Cannot update data: no current entry is selected.");
    }
    
    const entryBeforeUpdate = currentExtractedEntry;
    setIdDataHistory((prevHistory) => [...prevHistory, entryBeforeUpdate.idCardData]);

    const updatedEntry: VotingEntry = {
      ...entryBeforeUpdate,
      idCardData: updatedIDCardData,
      validationStatus: ValidationStatus.PENDING,
      validatedBy: undefined,
      validationTimestamp: undefined,
    };
    
    setCurrentExtractedEntry(updatedEntry);

    try {
      await votingDB.updateEntry(updatedEntry);
      channel.postMessage({ type: 'ENTRY_UPDATED', payload: updatedEntry });
      setAllVotingEntries((prevEntries) =>
        prevEntries.map((entry) =>
          entry.id === updatedEntry.id ? updatedEntry : entry
        )
      );
    } catch (error) {
      console.error('Error updating entry in IndexedDB:', error);
      setCurrentExtractedEntry(entryBeforeUpdate);
      setIdDataHistory((prevHistory) => prevHistory.slice(0, -1));
      throw error;
    }
  }, [channel, currentExtractedEntry]);

  const handleUndoCurrentExtractedIDDataEdit = useCallback(async () => {
    if (!currentExtractedEntry || idDataHistory.length === 0) return;

    setIdDataHistory((prevHistory) => {
      const previousIDCardData = prevHistory[prevHistory.length - 1];
      const newHistory = prevHistory.slice(0, -1);

      const updatedEntry: VotingEntry = {
        ...currentExtractedEntry,
        idCardData: previousIDCardData,
        validationStatus: ValidationStatus.PENDING,
        validatedBy: undefined,
        validationTimestamp: undefined,
      };

      votingDB.updateEntry(updatedEntry)
        .then(() => {
          channel.postMessage({ type: 'ENTRY_UPDATED', payload: updatedEntry });
          setAllVotingEntries((currentAllEntries) =>
            currentAllEntries.map((entry) =>
              entry.id === currentExtractedEntry.id ? updatedEntry : entry
            )
          );
        })
        .catch(error => {
          console.error('Error undoing ID data edit in IndexedDB:', error);
        });

      setCurrentExtractedEntry(updatedEntry);
      return newHistory;
    });
  }, [currentExtractedEntry, idDataHistory, channel]);


  const handleClearAllVotingEntries = useCallback(async () => {
    try {
      await votingDB.clearAllEntries();
      channel.postMessage({ type: 'ALL_ENTRIES_CLEARED' });
      setAllVotingEntries([]);
      setCurrentExtractedEntry(null);
      setIdDataHistory([]);
    } catch (error) {
      console.error('Error clearing all voting entries from IndexedDB:', error);
    }
  }, [channel]);
  
  // --- Candidate Handlers ---
  const handleAddCandidate = useCallback(async (candidateData: Omit<Candidate, 'id'>) => {
    const newCandidate: Candidate = { ...candidateData, id: `cand-${Date.now()}` };
    await votingDB.addCandidate(newCandidate);
    channel.postMessage({ type: 'CANDIDATE_ADDED', payload: newCandidate });
    setAllCandidates(prev => [...prev, newCandidate]);
  }, [channel]);

  const handleUpdateCandidate = useCallback(async (candidate: Candidate) => {
    await votingDB.updateCandidate(candidate);
    channel.postMessage({ type: 'CANDIDATE_UPDATED', payload: candidate });
    setAllCandidates(prev => prev.map(c => c.id === candidate.id ? candidate : c));
  }, [channel]);

  const handleDeleteCandidate = useCallback(async (candidateId: string) => {
    await votingDB.deleteCandidate(candidateId);
    channel.postMessage({ type: 'CANDIDATE_DELETED', payload: candidateId });
    setAllCandidates(prev => prev.filter(c => c.id !== candidateId));
  }, [channel]);


  // A component to manage the logic for the main voter-facing UI
  const VoterInterface = () => {
    const location = useLocation();
    const { isAdminAuthenticated } = useAuth();
    const isTestMode = new URLSearchParams(location.search).get('testMode') === 'true';
    const [isScanning, setIsScanning] = useState(false);

    const possibleVoters = useMemo(() => allVotingEntries.filter(
        (e) => e.validationStatus === ValidationStatus.APPROVED && !e.hasVoted
    ), [allVotingEntries]);
    
    const handleSelectVoterInTestMode = useCallback((entry: VotingEntry) => {
        setCurrentExtractedEntry(entry);
        setIdDataHistory([]);
    }, []);

    const handleConfirmVote = useCallback(async (candidateId: string, candidateName: string) => {
        if (currentExtractedEntry) {
            await handleUpdateEntry({ 
                ...currentExtractedEntry, 
                hasVoted: true,
                votedForCandidateId: candidateId,
                votedForCandidateName: candidateName,
            });
        }
    }, [currentExtractedEntry, handleUpdateEntry]);

    if (currentExtractedEntry) {
        const isEligibleToVote =
            currentExtractedEntry.validationStatus === ValidationStatus.APPROVED &&
            !!currentExtractedEntry.assignedPosition &&
            !currentExtractedEntry.hasVoted;

        if (isEligibleToVote) {
            return (
                <VotingInterfaceUI
                    entry={currentExtractedEntry}
                    candidates={allCandidates}
                    onConfirmVote={handleConfirmVote}
                    onClear={handleClearCurrentEntry}
                />
            );
        }

        return (
            <ExtractedIDData
                entry={currentExtractedEntry}
                onClear={handleClearCurrentEntry}
                onUpdateIDData={handleUpdateCurrentExtractedIDData}
                onUndoIDDataEdit={handleUndoCurrentExtractedIDDataEdit}
                canUndo={idDataHistory.length > 0}
                onUpdateEntry={handleUpdateEntry}
            />
        );
    }

    if (isTestMode) {
        if (isAdminAuthenticated) {
            return <PossibleVoters voters={possibleVoters} onVoterSelect={handleSelectVoterInTestMode} />;
        }
        return <TestModeAccessDenied />;
    }

    return (
        <>
            <h1 className="text-4xl font-extrabold text-center text-theme-primary">
                Secure Biometric Voting Interface
            </h1>
            <p className="text-center text-lg text-gray-600 dark:text-gray-300">
                A secure and light processing system for a singular voting event, initialized via biometric and facial data from a valid country identification card.
            </p>
            {isScanning ? (
                <IDScanner onIDDataExtracted={handleIDDataExtracted} />
            ) : (
                <div className="bg-theme-card p-8 rounded-lg shadow-lg text-center border border-theme-border mt-8">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-theme-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                       <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 013.75 9.375v-4.5zM3.75 14.625c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 013.75 19.125v-4.5zM13.5 4.875c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 0113.5 9.375v-4.5zM13.5 14.625c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 0113.5 19.125v-4.5z" />
                    </svg>
                    <h2 className="text-2xl font-bold mt-4 mb-2">Ready to Vote?</h2>
                    <p className="mb-6 text-gray-500 max-w-sm mx-auto">Click the button below to start the secure ID verification process using your device's camera or by uploading an image.</p>
                    <Button onClick={() => setIsScanning(true)} size="lg" variant="primary" className="inline-flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Scan ID to Begin
                    </Button>
                </div>
            )}
        </>
    );
  };

  const Navbar: React.FC = () => {
    const { isAdminAuthenticated, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();

    return (
      <nav className="bg-theme-card text-theme-text p-4 shadow-md sticky top-0 z-40 border-b border-theme-border">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-theme-primary">
            VotingApp
          </Link>
          <div className="flex items-center space-x-4">
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
            {isAdminAuthenticated ? (
              <>
                <Button variant="secondary" onClick={() => navigate('/admin/dashboard')}>
                  Admin Dashboard
                </Button>
                <Button variant="danger" onClick={logout}>
                  Logout
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/admin-login')}>
                Admin Login
              </Button>
            )}
          </div>
        </div>
      </nav>
    );
  };

  if (isLoadingApp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-background text-theme-text">
        <LoadingSpinner />
        <p className="ml-4 text-lg">Loading application data...</p>
      </div>
    );
  }

  return (
    <Router>
      <Navbar />
      <div className="min-h-screen bg-theme-background text-theme-text">
        <Routes>
          <Route
            path="/"
            element={
              <div className="flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto w-full space-y-8">
                  <VoterInterface />
                </div>
              </div>
            }
          />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <AdminDashboard
                  allVotingEntries={allVotingEntries}
                  allCandidates={allCandidates}
                  onUpdateEntry={handleUpdateEntry}
                  onClearAllEntries={handleClearAllVotingEntries}
                  onAddEntry={handleAddEntry}
                  onAddCandidate={handleAddCandidate}
                  onUpdateCandidate={handleUpdateCandidate}
                  onDeleteCandidate={handleDeleteCandidate}
                />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={
            <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center bg-theme-background text-theme-text p-4">
              <h2 className="text-4xl font-bold mb-4">404 - Page Not Found</h2>
              <p className="text-lg mb-6">The page you are looking for does not exist.</p>
              <Button onClick={() => window.location.href = '#/'} variant="primary">
                Go to Home
              </Button>
            </div>
          } />
        </Routes>
      </div>
    </Router>
  );
};

// Root Component Wrapper for Contexts
const AppWrapper: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default AppWrapper;
