/**
 * Primary extension UI — Chrome Side Panel (stays open while the user clicks the form).
 * Composes Profile / Match / Autofill from ../popup/ plus Settings (Groq key).
 * Toolbar click opens this panel via background.js (not a transient popup).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { getProfileId, setProfileId, clearProfileId } from '../lib/storage';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { ProfileSection } from '../popup/ProfileSection';
import { MatchSection } from '../popup/MatchSection';
import { AutofillSection } from '../popup/AutofillSection';
import { SettingsPanel } from '../popup/SettingsPanel';

function sendMessageSafe(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch {
      resolve(null);
    }
  });
}

function shortenHost(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.slice(0, 28) : '');
  } catch {
    return '';
  }
}

export function Panel() {
  const [profile, setProfile] = useState(null);
  const [loadingText, setLoadingText] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);
  const [tabInfo, setTabInfo] = useState({ id: null, title: '', url: '', host: '' });
  const [fillActive, setFillActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { loading, error, uploadResume, checkBackend, clearError } = useApi();
  const version = chrome.runtime.getManifest().version;

  const refreshActiveTab = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      setTabInfo({
        id: tab.id ?? null,
        title: tab.title || '',
        url: tab.url || '',
        host: shortenHost(tab.url || ''),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const getPageProfileId = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return null;
      const response = await sendMessageSafe(tab.id, { action: 'getPageProfileId' });
      return response?.profileId || null;
    } catch {
      return null;
    }
  }, []);

  const syncProfileIdToPage = useCallback(async (profileId) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      await sendMessageSafe(tab.id, { action: 'setPageProfileId', profileId });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setBackendOnline(await checkBackend());
      await refreshActiveTab();
      let savedProfileId = await getProfileId();
      if (!savedProfileId) {
        savedProfileId = await getPageProfileId();
        if (savedProfileId) await setProfileId(savedProfileId);
      }
      try {
        let result = null;
        if (savedProfileId) {
          const response = await fetch(`http://localhost:3000/api/profile/${savedProfileId}`);
          if (response.ok) result = await response.json();
        }
        if (!result?.data) {
          const response = await fetch('http://localhost:3000/api/profile/latest');
          if (response.ok) result = await response.json();
        }
        if (result?.success && result.data) {
          setProfile(result.data);
          await setProfileId(result.data.id);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };
    init();
  }, [checkBackend, getPageProfileId, refreshActiveTab]);

  useEffect(() => {
    const onActivated = () => { refreshActiveTab(); };
    const onUpdated = (tabId, info, tab) => {
      if (info.status === 'complete' && tab.active) refreshActiveTab();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refreshActiveTab]);

  const handleUpload = useCallback(async (file) => {
    clearError();
    setLoadingText('Uploading resume…');
    try {
      const data = await uploadResume(file);
      setProfile(data);
      await setProfileId(data.id);
      await syncProfileIdToPage(data.id);
    } finally {
      setLoadingText('');
    }
  }, [uploadResume, clearError, syncProfileIdToPage]);

  const handleClear = useCallback(async () => {
    setProfile(null);
    await clearProfileId();
    await syncProfileIdToPage(null);
    clearError();
  }, [clearError, syncProfileIdToPage]);

  const displayError = error || (!backendOnline ? 'Backend offline — run make dev-backend' : null);

  return (
    <div className="h-screen w-full min-w-[280px] bg-slate-900 text-slate-100 flex flex-col">
      <header className="bg-slate-800/95 px-3 py-2.5 border-b border-slate-700 shrink-0 sticky top-0 z-10 backdrop-blur">
        <div className="flex justify-between items-center gap-2">
          <h1 className="text-base font-semibold tracking-tight">JobFitly</h1>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              aria-label="Settings"
              className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-700/60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <span className="text-[10px] text-slate-400 bg-slate-700/80 px-1.5 py-0.5 rounded">
              v{version}
            </span>
          </div>
        </div>
        {tabInfo.host ? (
          <p className="text-[10px] text-slate-500 mt-1 truncate" title={tabInfo.url}>
            {fillActive ? 'Filling' : 'Tab'}: <span className="text-slate-300">{tabInfo.host}</span>
          </p>
        ) : (
          <p className="text-[10px] text-slate-500 mt-1">
            Open a job posting — Analyze fit, then Fill Form
          </p>
        )}
      </header>

      {displayError && <ErrorBanner message={displayError} />}

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        <div className={fillActive ? 'opacity-70' : ''}>
          <ProfileSection
            profile={profile}
            loading={loading && loadingText.toLowerCase().includes('upload')}
            onUpload={handleUpload}
            onClear={handleClear}
            compact={fillActive}
          />
        </div>

        {profile && (
          <>
            <MatchSection profile={profile} disabled={fillActive} />
            <div className="border-t border-slate-800 mx-3" />
            <AutofillSection
              profile={profile}
              activeTabId={tabInfo.id}
              onFillActiveChange={setFillActive}
            />
          </>
        )}

        {!profile && (
          <p className="px-4 text-xs text-slate-500 leading-relaxed">
            Upload a resume to score jobs and autofill. This side panel stays open while you click
            the form.
          </p>
        )}
      </div>

      <footer className="bg-slate-800 px-3 py-2 border-t border-slate-700 shrink-0">
        <p className="text-[10px] text-slate-400 text-center leading-snug">
          Backend{' '}
          <span className={backendOnline ? 'text-green-400' : 'text-red-400'}>
            {backendOnline ? 'online' : 'offline'}
          </span>
          {' · '}Analyze → decide · Never Submit · Review AI drafts
        </p>
      </footer>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Spinner text={loadingText} show={loading} />
    </div>
  );
}
