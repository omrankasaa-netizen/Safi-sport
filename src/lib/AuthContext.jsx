import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { kh, cachedMe } from '@/api/khClient';

const AuthContext = createContext();

/**
 * Same context shape the ported UI expects, backed by our own
 * Kimi-OAuth session instead of the hosted Base44 auth.
 */
export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkUserAuth();
  }, []);

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await cachedMe(true);
      setUser(currentUser);
      setIsAuthenticated(currentUser != null);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkAppState = () => checkUserAuth();

  const logout = async (shouldRedirect = true) => {
    await kh.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) navigate('/');
  };

  const navigateToLogin = () => {
    navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError,
        appPublicSettings: null,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
