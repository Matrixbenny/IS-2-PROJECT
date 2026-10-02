import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await apiGet('/auth/me');
      setUser(me);
    } catch (_) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { user: loggedIn } = await apiPost('/auth/login', { email, password });
    setUser(loggedIn);
    return loggedIn;
  };

  const register = async (payload) => {
    const { user: created } = await apiPost('/auth/register', payload);
    setUser(created);
    return created;
  };

  const logout = async () => {
    await apiPost('/auth/logout', {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
