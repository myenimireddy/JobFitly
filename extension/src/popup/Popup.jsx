import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { getProfileId, setProfileId, clearProfileId } from '../lib/storage';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { ProfileSection } from './ProfileSection';
import { AutofillSection } from './AutofillSection';

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

export function Popup() {
  const [profile, setProfile] = useState(null);
  const [loadingText, setLoadingText] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);
  const { loading, error, uploadResume, checkBackend, clearError } = useApi();
  const version = chrome.runtime.getManifest().version;

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
      // ignore
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setBackendOnline(await checkBackend());
      let savedProfileId = await getProfileId();
      if (!savedProfileId) {
        savedProfileId = await getPageProfileId();
        if (savedProfileId) await setProfileId(savedProfileId);
      }
      if (!savedProfileId) return;
      try {
        const response = await fetch(`http://localhost:3000/api/profile/${savedProfileId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) setProfile(result.data);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };
    init();
  }, [checkBackend, getPageProfileId]);

  const handleUpload = useCallback(async (file) => {
    clearError();
    setLoadingText('Uploading resume...');
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

  const displayError = error || (!backendOnline ? 'Backend not running. Start with: make dev-backend' : null);

  return (
    <div className="w-[380px] bg-slate-900 text-slate-100 flex flex-col max-h-[560px]">
      <header className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex justify-between items-center shrink-0">
        <h1 className="text-lg font-semibold">JobFitly</h1>
        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">v{version}</span>
      </header>

      {displayError && <ErrorBanner message={displayError} />}

      <div className="flex-1 overflow-y-auto">
        <ProfileSection
          profile={profile}
          loading={loading && loadingText.includes('Upload')}
          onUpload={handleUpload}
          onClear={handleClear}
        />
        {profile && <AutofillSection profile={profile} />}
      </div>

      <footer className="bg-slate-800 px-4 py-2 border-t border-slate-700 shrink-0">
        <p className="text-xs text-slate-400 text-center">
          Backend:{' '}
          <span className={backendOnline ? 'text-green-400' : 'text-red-400'}>
            {backendOnline ? 'Online' : 'Offline'}
          </span>
        </p>
      </footer>
      <Spinner text={loadingText} show={loading} />
    </div>
  );
}
