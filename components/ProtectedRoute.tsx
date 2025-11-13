
import React from 'react';
import { useAuth } from './AuthProvider';
import { ProtectedRouteProps } from '../types';
import Button from './Button';
import { useNavigate } from 'react-router-dom';

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAdminAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme-background text-theme-text p-4">
        <div className="bg-theme-card p-8 rounded-lg shadow-lg text-center border border-theme-border">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="mb-6">You must be logged in as an administrator to view this page.</p>
          <Button onClick={() => navigate('/admin-login')} variant="primary">
            Go to Admin Login
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
