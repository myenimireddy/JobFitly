/**
 * Primary extension UI — Chrome Side Panel (stays open while the user clicks the form).
 * Composes Profile / Match / Autofill from ../popup/ plus Settings (API base + Groq).
 * Toolbar click opens this panel via background.js (not a transient popup).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { getProfileId, setProfileId, clearProfileId } from '../lib/storage';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { ProfileSection } from '../popup/ProfileSection';
import { ApplicationProfileCapture } from '../popup/ApplicationProfileCapture';
import { MatchSection } from '../popup/MatchSection';
import { AutofillSection } from '../popup/AutofillSection';
import { SettingsPanel } from '../popup/SettingsPanel';
import { nextShowCapture } from '../lib/captureSession';

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
  const [profileSummaries, setProfileSummaries] = useState([]);
  const [loadingText, setLoadingText] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);
  const [tabInfo, setTabInfo] = useState({ id: null, title: '', url: '', host: '' });
  const [fillActive, setFillActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [staleNote, setStaleNote] = useState(null);
  /** Last http(s) tab in this window — Fill Form target when Side Panel is not native. */
  const [jobTabId, setJobTabId] = useState(null);
  const {
    loading,
    error,
    uploadResume,
    deleteProfile,
    listProfiles,
    fetchProfile,
    fetchLatestProfile,
    checkBackend,
    clearError,
  } = useApi();
  const version = chrome.runtime.getManifest().version;
  const captureComplete = !!profile?.parsedData?.applicationProfile?.captureComplete;

  const refreshActiveTab = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const url = tab.url || '';
      if (/^https?:/i.test(url) && tab.id != null) {
        setJobTabId(tab.id);
        setTabInfo({
          id: tab.id,
          title: tab.title || '',
          url,
          host: shortenHost(url),
        });
        return;
      }
      if (jobTabId != null) {
        try {
          const job = await chrome.tabs.get(jobTabId);
          if (job?.id != null && /^https?:/i.test(job.url || '')) {
            setTabInfo({
              id: job.id,
              title: job.title || '',
              url: job.url || '',
              host: shortenHost(job.url || ''),
            });
            return;
          }
        } catch { /* closed */ }
      }
      setTabInfo({
        id: tab.id ?? null,
        title: tab.title || '',
        url,
        host: shortenHost(url),
      });
    } catch {
      /* ignore */
    }
  }, [jobTabId]);

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

  const refreshSummaries = useCallback(async () => {
    try {
      const rows = await listProfiles();
      setProfileSummaries(rows);
    } catch {
      setProfileSummaries([]);
    }
  }, [listProfiles]);

  const applyProfile = useCallback(async (data) => {
    if (!data?.id) return;
    setStaleNote(null);
    setProfile(data);
    await setProfileId(data.id);
    await syncProfileIdToPage(data.id);
    setShowCapture(nextShowCapture('profile-loaded', {
      captureComplete: !!data?.parsedData?.applicationProfile?.captureComplete,
    }));
    await refreshSummaries();
  }, [syncProfileIdToPage, refreshSummaries]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const online = await checkBackend();
      if (cancelled) return;
      setBackendOnline(online);
      await refreshActiveTab();
      if (online) {
        try {
          await refreshSummaries();
        } catch { /* ignore */ }
      }

      let savedProfileId = await getProfileId();
      if (!savedProfileId) {
        savedProfileId = await getPageProfileId();
        if (savedProfileId) await setProfileId(savedProfileId);
      }

      // Load once per panel session. Tab changes must not reopen Application details.
      if (!savedProfileId || cancelled) return;
      try {
        const data = await fetchProfile(savedProfileId);
        if (!cancelled) await applyProfile(data);
      } catch (err) {
        if (cancelled) return;
        console.warn('[JobFitly] Saved profile missing; clear and upload or load latest.', err);
        await clearProfileId();
        await syncProfileIdToPage(null);
        setProfile(null);
        setStaleNote('Saved profile is no longer on this backend. Upload a resume or use Load latest.');
      }
    };
    init();
    return () => { cancelled = true; };
    // Panel session load only. refreshActiveTab changes on every job tab and must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await applyProfile(data);
      setShowCapture(nextShowCapture('resume-uploaded'));
    } finally {
      setLoadingText('');
    }
  }, [uploadResume, clearError, applyProfile]);

  const handleClear = useCallback(async () => {
    setProfile(null);
    setShowCapture(nextShowCapture('cleared'));
    await clearProfileId();
    await syncProfileIdToPage(null);
    clearError();
    await refreshSummaries();
  }, [clearError, syncProfileIdToPage, refreshSummaries]);

  const handleDelete = useCallback(async () => {
    const id = profile?.id;
    clearError();
    if (id) {
      try {
        await deleteProfile(id);
      } catch {
        return;
      }
    }
    setProfile(null);
    setShowCapture(nextShowCapture('cleared'));
    await clearProfileId();
    await syncProfileIdToPage(null);
    await refreshSummaries();
  }, [profile?.id, deleteProfile, clearError, syncProfileIdToPage, refreshSummaries]);

  const handleLoadLatest = useCallback(async () => {
    clearError();
    setLoadingText('Loading latest profile…');
    try {
      const data = await fetchLatestProfile();
      await applyProfile(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingText('');
    }
  }, [fetchLatestProfile, applyProfile, clearError]);

  const handleSelectProfile = useCallback(async (profileId) => {
    if (!profileId || profileId === profile?.id) return;
    clearError();
    setLoadingText('Switching profile…');
    try {
      const data = await fetchProfile(profileId);
      await applyProfile(data);
    } catch (err) {
      setStaleNote(err.message || 'Could not load the selected profile.');
    } finally {
      setLoadingText('');
    }
  }, [profile?.id, fetchProfile, applyProfile, clearError]);

  const displayError = error
    || staleNote
    || (!backendOnline ? 'Backend offline — run ./scripts/start.sh' : null);

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
            profileSummaries={profileSummaries}
            loading={loading || !!loadingText}
            onUpload={handleUpload}
            onClear={handleClear}
            onDelete={handleDelete}
            onLoadLatest={handleLoadLatest}
            onSelectProfile={handleSelectProfile}
            compact={fillActive}
          />
          <div
            aria-hidden="true"
            data-testid="panel-ready"
            data-profile-id={profile?.id || ''}
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
          />
        </div>

        {profile?.id && showCapture && !fillActive && (
          <ApplicationProfileCapture
            profileId={profile.id}
            onSaved={(updated) => {
              if (updated) setProfile(updated);
              setShowCapture(nextShowCapture('saved'));
              refreshSummaries();
            }}
            onSkip={() => setShowCapture(nextShowCapture('later'))}
          />
        )}

        {profile && !showCapture && !fillActive && (
          <div
            className={`mx-3 mb-2 flex items-center justify-between rounded-md px-2.5 py-1.5 border ${
              captureComplete
                ? 'border-green-800/30 bg-green-900/20'
                : 'border-amber-800/40 bg-amber-950/30'
            }`}
          >
            <p className={`text-[10px] ${captureComplete ? 'text-green-300' : 'text-amber-200/90'}`}>
              {captureComplete
                ? 'Application profile ready'
                : 'Application details incomplete — Fill Form will ask more'}
            </p>
            <button
              type="button"
              onClick={() => setShowCapture(nextShowCapture('edit'))}
              className="text-[10px] text-indigo-300 hover:text-indigo-200 underline shrink-0 ml-2"
            >
              {captureComplete ? 'Edit details' : 'Complete details'}
            </button>
          </div>
        )}

        {profile && (
          <>
            <MatchSection
              profile={profile}
              disabled={fillActive}
              jobUrl={tabInfo.url}
              activeTabId={jobTabId || tabInfo.id}
            />
            <div className="border-t border-slate-800 mx-3" />
            <AutofillSection
              profile={profile}
              activeTabId={jobTabId || tabInfo.id}
              onFillActiveChange={setFillActive}
            />
          </>
        )}

        {!profile && (
          <p className="px-4 text-xs text-slate-500 leading-relaxed">
            Upload a resume to score jobs and autofill. Clear only hides the profile here; Delete
            removes it from the local database. This side panel stays open while you click the form.
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
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={async (payload) => {
          setBackendOnline(await checkBackend());
          // New API origin → old profileId may 404; clear panel like Clear.
          if (payload?.apiOrigin) {
            setProfile(null);
            setShowCapture(nextShowCapture('cleared'));
            await clearProfileId();
            await syncProfileIdToPage(null);
          }
          await refreshSummaries();
        }}
      />
      <Spinner text={loadingText} show={loading || !!loadingText} />
    </div>
  );
}
