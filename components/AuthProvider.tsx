import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AuthContextType, AdminUser } from '../types';
import { ADMIN_USERS } from '../constants';
import { votingDB } from '../services/dbService'; // Import the IndexedDB service

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [loggedInAdmin, setLoggedInAdmin] = useState<AdminUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true); // New loading state for auth

  // Function to initialize admin users in IndexedDB
  const initializeAdminUsers = useCallback(async () => {
    try {
      await votingDB.openDb(); // Ensure DB is open
      const existingAdmins = await votingDB.getAllAdminUsers();
      if (existingAdmins.length === 0) {
        // Only seed if no admins exist
        console.log('Seeding initial admin users into IndexedDB...');
        for (const admin of ADMIN_USERS) {
          await votingDB.addAdminUser(admin);
        }
      }
    } catch (error) {
      console.error('Error initializing admin users in IndexedDB:', error);
    }
  }, []);

  // Attempt to load admin session from IndexedDB on mount
  useEffect(() => {
    const loadAdminSession = async () => {
      setIsAuthLoading(true);
      try {
        await initializeAdminUsers(); // Ensure admins are seeded before trying to log in
        const storedAdminId = localStorage.getItem('loggedInAdminId'); // Use ID for simple session tracking

        if (storedAdminId) {
          const admin = await votingDB.getAdminUserById(storedAdminId);
          // Re-validate against predefined ADMIN_USERS for extra security/consistency check
          const isValidAdmin = ADMIN_USERS.some(
            (a) => a.id === admin?.id && a.username === admin?.username && a.fullName === admin?.fullName && a.role === admin?.role
          );
          if (isValidAdmin && admin) {
            setLoggedInAdmin(admin);
            setIsAdminAuthenticated(true);
          } else {
            localStorage.removeItem('loggedInAdminId'); // Clear invalid session
          }
        }
      } catch (error) {
        console.error('Error loading admin session from IndexedDB:', error);
        localStorage.removeItem('loggedInAdminId'); // Clear session on DB error
      } finally {
        setIsAuthLoading(false);
      }
    };
    loadAdminSession();
  }, [initializeAdminUsers]);

  const login = useCallback(async (username, password) => {
    try {
      await votingDB.openDb(); // Ensure DB is open
      const admin = await votingDB.getAdminUser(username); // Get admin from DB
      if (admin && admin.passwordHash === password) { // Mocked password check
        setLoggedInAdmin(admin);
        setIsAdminAuthenticated(true);
        localStorage.setItem('loggedInAdminId', admin.id); // Store ID for re-authentication
        return true;
      }
    } catch (error) {
      console.error('Error during admin login:', error);
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setLoggedInAdmin(null);
    setIsAdminAuthenticated(false);
    localStorage.removeItem('loggedInAdminId');
  }, []);

  const value = {
    isAdminAuthenticated,
    loggedInAdmin,
    login,
    logout,
  };

  // Only render children when auth state is done loading
  if (isAuthLoading) {
    return null; // Or a loading spinner if you want to show it before the main app mounts
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
