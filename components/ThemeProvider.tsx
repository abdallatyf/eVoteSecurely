
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Theme, ThemeContextType } from '../types';
import { DEFAULT_THEME, THEMES } from '../constants';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && Object.values(Theme).includes(savedTheme as Theme)) {
      return savedTheme as Theme;
    }
    return DEFAULT_THEME;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    if (!THEMES.includes(newTheme)) {
      console.warn(`Attempted to set invalid theme: ${newTheme}. Falling back to default.`);
      setThemeState(DEFAULT_THEME);
    } else {
      setThemeState(newTheme);
    }
  }, []);

  const value = {
    theme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
