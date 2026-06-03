import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

const STORAGE_KEY = 'jobfitcheck_profile_id';

// Initial state
const initialState = {
  profile: null,
  job: null,
  match: null,
  loading: { profile: false, job: false, match: false },
  error: { profile: null, job: null, match: null },
  backendOnline: false,
  llmStatus: { available: false, provider: 'ollama', message: 'Checking...' },
};

// Action types
const ACTIONS = {
  SET_PROFILE: 'SET_PROFILE',
  SET_JOB: 'SET_JOB',
  SET_MATCH: 'SET_MATCH',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_BACKEND_ONLINE: 'SET_BACKEND_ONLINE',
  SET_LLM_STATUS: 'SET_LLM_STATUS',
  RESET_JOB: 'RESET_JOB',
  CLEAR_ALL: 'CLEAR_ALL'
};

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PROFILE:
      return { ...state, profile: action.payload };
    case ACTIONS.SET_JOB:
      return { ...state, job: action.payload };
    case ACTIONS.SET_MATCH:
      return { ...state, match: action.payload };
    case ACTIONS.SET_LOADING:
      return { 
        ...state, 
        loading: { ...state.loading, [action.key]: action.value } 
      };
    case ACTIONS.SET_ERROR:
      return { 
        ...state, 
        error: { ...state.error, [action.key]: action.value } 
      };
    case ACTIONS.SET_BACKEND_ONLINE:
      return { ...state, backendOnline: action.payload };
    case ACTIONS.SET_LLM_STATUS:
      return { ...state, llmStatus: action.payload };
    case ACTIONS.RESET_JOB:
      return { 
        ...state, 
        job: null, 
        match: null,
        error: { ...state.error, job: null, match: null }
      };
    case ACTIONS.CLEAR_ALL:
      return initialState;
    default:
      return state;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const api = useApi();

  // Check backend status
  const checkBackend = useCallback(async () => {
    const isOnline = await api.checkBackend();
    dispatch({ type: ACTIONS.SET_BACKEND_ONLINE, payload: isOnline });
    return isOnline;
  }, [api]);

  // Check LLM status
  const checkLLMStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3000/api/llm/status');
      if (!res.ok) return;
      const { data } = await res.json();
      dispatch({ type: ACTIONS.SET_LLM_STATUS, payload: data });
    } catch { /* backend offline, ignore */ }
  }, []);

  // Load profile from storage on mount
  useEffect(() => {
    const init = async () => {
      const isOnline = await checkBackend();
      if (isOnline) checkLLMStatus();
      
      if (!isOnline) {
        dispatch({ 
          type: ACTIONS.SET_ERROR, 
          key: 'profile', 
          value: 'Backend is not running. Start it with: npm run dev in /backend' 
        });
        return;
      }

      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        dispatch({ type: ACTIONS.SET_LOADING, key: 'profile', value: true });
        const { data, error } = await api.fetchProfile(savedId);
        dispatch({ type: ACTIONS.SET_LOADING, key: 'profile', value: false });
        
        if (data) {
          dispatch({ type: ACTIONS.SET_PROFILE, payload: data });
        } else if (error) {
          dispatch({ type: ACTIONS.SET_ERROR, key: 'profile', value: error });
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    };

    init();
  }, [checkBackend, checkLLMStatus, api]);

  // Re-check status when user returns to the tab (tab focus / window focus)
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === 'visible') {
        const isOnline = await checkBackend();
        if (isOnline) checkLLMStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [checkBackend, checkLLMStatus]);

  // Actions
  const uploadResume = useCallback(async (file) => {
    dispatch({ type: ACTIONS.SET_LOADING, key: 'profile', value: true });
    dispatch({ type: ACTIONS.SET_ERROR, key: 'profile', value: null });

    const { data, error } = await api.uploadResume(file);
    
    dispatch({ type: ACTIONS.SET_LOADING, key: 'profile', value: false });
    
    if (data) {
      dispatch({ type: ACTIONS.SET_PROFILE, payload: data });
      localStorage.setItem(STORAGE_KEY, data.id);
      return { success: true };
    } else {
      dispatch({ type: ACTIONS.SET_ERROR, key: 'profile', value: error });
      return { success: false, error };
    }
  }, [api]);

  const extractJob = useCallback(async ({ url, rawText }) => {
    dispatch({ type: ACTIONS.SET_LOADING, key: 'job', value: true });
    dispatch({ type: ACTIONS.SET_ERROR, key: 'job', value: null });

    const jobUrl = url || 'pasted-text';
    const html = rawText || '';

    const { data, error } = await api.extractJob(jobUrl, html);
    
    dispatch({ type: ACTIONS.SET_LOADING, key: 'job', value: false });
    
    if (data) {
      dispatch({ type: ACTIONS.SET_JOB, payload: data });
      return { success: true };
    } else {
      dispatch({ type: ACTIONS.SET_ERROR, key: 'job', value: error });
      return { success: false, error };
    }
  }, [api]);

  const runMatch = useCallback(async () => {
    if (!state.profile || !state.job) {
      dispatch({ 
        type: ACTIONS.SET_ERROR, 
        key: 'match', 
        value: 'Profile and job required for match analysis' 
      });
      return { success: false };
    }

    dispatch({ type: ACTIONS.SET_LOADING, key: 'match', value: true });
    dispatch({ type: ACTIONS.SET_ERROR, key: 'match', value: null });

    const { data, error } = await api.runMatch(state.profile.id, state.job.id);
    
    dispatch({ type: ACTIONS.SET_LOADING, key: 'match', value: false });
    
    if (data) {
      dispatch({ type: ACTIONS.SET_MATCH, payload: data });
      return { success: true };
    } else {
      dispatch({ type: ACTIONS.SET_ERROR, key: 'match', value: error });
      return { success: false, error };
    }
  }, [api, state.profile, state.job]);

  const resetJob = useCallback(() => {
    dispatch({ type: ACTIONS.RESET_JOB });
  }, []);

  const updateProfile = useCallback(async (parsedData) => {
    if (!state.profile?.id) return { success: false, error: 'No profile loaded' };
    dispatch({ type: ACTIONS.SET_LOADING, key: 'profile', value: true });
    dispatch({ type: ACTIONS.SET_ERROR, key: 'profile', value: null });
    const { data, error } = await api.updateProfile(state.profile.id, parsedData);
    dispatch({ type: ACTIONS.SET_LOADING, key: 'profile', value: false });
    if (data) {
      dispatch({ type: ACTIONS.SET_PROFILE, payload: data });
      return { success: true };
    } else {
      dispatch({ type: ACTIONS.SET_ERROR, key: 'profile', value: error });
      return { success: false, error };
    }
  }, [api, state.profile?.id]);

  const clearProfile = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: ACTIONS.CLEAR_ALL });
  }, []);

  const deleteProfile = useCallback(async () => {
    const id = state.profile?.id;
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: ACTIONS.CLEAR_ALL });
    if (id) {
      const { error } = await api.deleteProfile(id);
      if (error) console.warn('[profile] Delete API error (local state already cleared):', error);
    }
  }, [api, state.profile?.id]);

  const clearError = useCallback((key) => {
    dispatch({ type: ACTIONS.SET_ERROR, key, value: null });
  }, []);

  const value = {
    ...state,
    uploadResume,
    updateProfile,
    extractJob,
    runMatch,
    resetJob,
    clearProfile,
    deleteProfile,
    clearError,
    checkBackend,
    checkLLMStatus,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
