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
import { VotingEntry, IDCardData, ValidationStatus, Theme } from './types';
import { ADMIN_USERS, THEMES, themeColorMapping } from './constants'; // Import ADMIN_USERS for login page
import { votingDB } from './services/dbService'; // Import the IndexedDB service

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
            // Avoid adding a duplicate if the message came from the same tab that already updated its state
            if (prevEntries.some((e) => e.id === newEntry.id)) {
              return prevEntries;
            }
            return [...prevEntries, newEntry];
          });
          break;
        }
        case 'ENTRY_UPDATED': {
          const updatedEntry = payload as VotingEntry;
          setAllVotingEntries((prevEntries) =>
            prevEntries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
          );
          // Also update the currently viewed entry if it's the one that was changed
          setCurrentExtractedEntry((prev) => (prev && prev.id === updatedEntry.id ? updatedEntry : prev));
          break;
        }
        case 'ALL_ENTRIES_CLEARED': {
          setAllVotingEntries([]);
          setCurrentExtractedEntry(null);
          setIdDataHistory([]);
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
    const loadEntries = async () => {
      try {
        await votingDB.openDb(); // Ensure DB is open
        const entries = await votingDB.getAllEntries();
        setAllVotingEntries(entries);
      } catch (error) {
        console.error('Error loading voting entries from IndexedDB:', error);
      } finally {
        setIsLoadingApp(false);
      }
    };
    loadEntries();
  }, []); // Run only once on mount

  const handleAddEntry = useCallback(async (idCardData: IDCardData): Promise<VotingEntry> => {
    const newEntry: VotingEntry = {
      id: `entry-${Date.now()}`,
      idCardData: idCardData,
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
      // Optionally handle UI feedback for the user
      throw error; // Re-throw to let the caller know it failed
    }
  }, [channel]);

  const handleIDDataExtracted = useCallback(async (idCardData: IDCardData) => {
    // Check if an entry with this ID number already exists.
    const existingEntry = allVotingEntries.find(
        entry => entry.idCardData.idNumber === idCardData.idNumber && idCardData.idNumber.trim() !== ''
    );

    if (existingEntry) {
        // If an entry exists, show it. The UI will then decide what actions are available (e.g., vote if approved).
        setCurrentExtractedEntry(existingEntry);
    } else {
        // This is a new voter. Create a new pending entry for validation.
        const newEntry = await handleAddEntry(idCardData);
        setCurrentExtractedEntry(newEntry);
    }
    setIdDataHistory([]); // Reset edit history for the newly loaded entry
}, [allVotingEntries, handleAddEntry]);

  const handleClearCurrentEntry = useCallback(() => {
    setCurrentExtractedEntry(null);
    setIdDataHistory([]); // Clear history when clearing entry
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

  // Handler for updating IDCardData within the currentExtractedEntry
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
    
    setCurrentExtractedEntry(updatedEntry); // Optimistically update UI

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
      // Revert optimistic UI update on failure
      setCurrentExtractedEntry(entryBeforeUpdate);
      setIdDataHistory((prevHistory) => prevHistory.slice(0, -1)); // Revert history
      throw error; // Re-throw so the calling component can handle it
    }
  }, [channel, currentExtractedEntry]);

  // New handler for undoing the last IDCardData edit
  const handleUndoCurrentExtractedIDDataEdit = useCallback(async () => {
    if (!currentExtractedEntry || idDataHistory.length === 0) return;

    setIdDataHistory((prevHistory) => {
      const previousIDCardData = prevHistory[prevHistory.length - 1]; // Get last state
      const newHistory = prevHistory.slice(0, -1); // Remove last state from history

      const updatedEntry: VotingEntry = {
        ...currentExtractedEntry, // Use currentExtractedEntry to get the ID and other unchanged fields
        idCardData: previousIDCardData,
        validationStatus: ValidationStatus.PENDING, // Any change, even undo, needs re-validation
        validatedBy: undefined,
        validationTimestamp: undefined,
      };

      // Update in IndexedDB and then update local state
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

      setCurrentExtractedEntry(updatedEntry); // Update the current entry in state

      return newHistory;
    });
  }, [currentExtractedEntry, idDataHistory, channel]);


  const handleClearAllVotingEntries = useCallback(async () => {
    try {
      await votingDB.clearAllEntries();
      channel.postMessage({ type: 'ALL_ENTRIES_CLEARED' });
      setAllVotingEntries([]);
      setCurrentExtractedEntry(null);
      setIdDataHistory([]); // Clear history when all entries are cleared
    } catch (error) {
      console.error('Error clearing all voting entries from IndexedDB:', error);
    }
  }, [channel]);

  // A component to manage the logic for the main voter-facing UI
  const VoterInterface = () => {
    const location = useLocation();
    const { isAdminAuthenticated } = useAuth();
    const isTestMode = new URLSearchParams(location.search).get('testMode') === 'true';

    const possibleVoters = useMemo(() => allVotingEntries.filter(
        (e) => e.validationStatus === ValidationStatus.APPROVED && !e.hasVoted
    ), [allVotingEntries]);
    
    const handleSelectVoterInTestMode = useCallback((entry: VotingEntry) => {
        setCurrentExtractedEntry(entry);
        setIdDataHistory([]);
    }, []);

    const handleConfirmVote = useCallback(async () => {
        if (currentExtractedEntry) {
            await handleUpdateEntry({ ...currentExtractedEntry, hasVoted: true });
        }
    }, [currentExtractedEntry]);

    // If an entry is selected (either via scan or test mode), decide which UI to show
    if (currentExtractedEntry) {
        const isEligibleToVote =
            currentExtractedEntry.validationStatus === ValidationStatus.APPROVED &&
            !!currentExtractedEntry.assignedPosition &&
            !currentExtractedEntry.hasVoted;

        if (isEligibleToVote) {
            return (
                <VotingInterfaceUI
                    entry={currentExtractedEntry}
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

    // If in test mode, check for authentication
    if (isTestMode) {
        if (isAdminAuthenticated) {
            return <PossibleVoters voters={possibleVoters} onVoterSelect={handleSelectVoterInTestMode} />;
        }
        return <TestModeAccessDenied />;
    }

    // Default view: ID Scanner
    return (
        <>
            <h1 className="text-4xl font-extrabold text-center text-theme-primary">
                Secure Biometric Voting Interface
            </h1>
            <p className="text-center text-lg text-gray-600 dark:text-gray-300">
                A secure and light processing system for a singular voting event, initialized via biometric and facial data from a valid country identification card.
            </p>
            <IDScanner onIDDataExtracted={handleIDDataExtracted} />
        </>
    );
  };

  // Top Navigation Bar
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
                  onUpdateEntry={handleUpdateEntry}
                  onClearAllEntries={handleClearAllVotingEntries}
                  onAddEntry={handleAddEntry}
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
