import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { getProfileId, setProfileId, clearProfileId } from '../lib/storage';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { ProfileSection } from './ProfileSection';
import { AnalyzeSection } from './AnalyzeSection';
import { ResultsSection } from './ResultsSection';
import { AutofillSection } from './AutofillSection';
import { DocumentsSection } from './DocumentsSection';

/**
 * Send a message to the content script, returning null if no receiver exists
 */
function sendMessageSafe(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Popup - Root component managing global state
 */
export function Popup() {
  // State
  const [profile, setProfile] = useState(null);
  const [job, setJob] = useState(null);
  const [match, setMatch] = useState(null);
  const [loadingText, setLoadingText] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  
  const { 
    loading, 
    error, 
    uploadResume, 
    analyzeJob, 
    getMatch, 
    checkBackend,
    clearError 
  } = useApi();

  // Get version from manifest
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;

  // Listen for messages from content script (form submission capture)
  useEffect(() => {
    const listener = (request, sender, sendResponse) => {
      if (request.action === 'saveUserAnswers' && profile?.id) {
        // Save captured answers to backend
        fetch('http://localhost:3000/api/autofill/save-answers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: profile.id,
            answers: request.answers
          })
        }).then(() => {
          sendResponse({ success: true });
        }).catch(() => {
          sendResponse({ success: false });
        });
        return true; // Keep channel open
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [profile]);

  // Try to read profileId from the active tab's localStorage (frontend page)
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

  // Push profileId to the active tab's localStorage (sync to frontend page)
  const syncProfileIdToPage = useCallback(async (profileId) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      await sendMessageSafe(tab.id, { action: 'setPageProfileId', profileId });
    } catch {
      // page may not have content script — ignore
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const isOnline = await checkBackend();
      setBackendOnline(isOnline);

      // Prefer extension storage, fall back to frontend page session
      let savedProfileId = await getProfileId();
      if (!savedProfileId) {
        savedProfileId = await getPageProfileId();
        if (savedProfileId) await setProfileId(savedProfileId);
      }

      if (savedProfileId) {
        try {
          const response = await fetch(`http://localhost:3000/api/profile/${savedProfileId}`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) setProfile(result.data);
          }
        } catch (err) {
          console.error('Failed to load profile:', err);
        }
      }
    };

    init();
  }, [checkBackend, getPageProfileId]);

  // Handle profile upload
  const handleUpload = useCallback(async (file) => {
    clearError();
    setLoadingText('Uploading resume...');
    
    try {
      const data = await uploadResume(file);
      setProfile(data);
      await setProfileId(data.id);
      await syncProfileIdToPage(data.id);
      setMatch(null);
    } catch (err) {
      // Error handled by useApi
    } finally {
      setLoadingText('');
    }
  }, [uploadResume, clearError]);

  // Handle profile clear
  const handleClear = useCallback(async () => {
    setProfile(null);
    setJob(null);
    setMatch(null);
    await clearProfileId();
    await syncProfileIdToPage(null);
    clearError();
  }, [clearError, syncProfileIdToPage]);

  // Handle job analysis
  const handleAnalyze = useCallback(async () => {
    if (!profile) return;
    
    clearError();
    setAnalyzeError(null);
    setLoadingText('Extracting job...');
    setMatch(null);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Inject content script dynamically if not already injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch {
        // Already injected or restricted page — continue anyway
      }

      // Send message to content script
      const jobData = await sendMessageSafe(tab.id, { action: 'getJobPageText' });

      if (!jobData) {
        setAnalyzeError('Could not read page. Make sure you are on a job posting page and the page has fully loaded.');
        return;
      }

      if (!jobData.success) {
        setAnalyzeError(jobData.error || 'This page does not look like a job posting. Navigate to a job listing first.');
        return;
      }

      // Extract job
      setLoadingText('Parsing job...');
      const jobResult = await analyzeJob(jobData.url, jobData.text);
      setJob(jobResult);

      // Get match
      setLoadingText('Analyzing match...');
      const matchResult = await getMatch(profile.id, jobResult.id);
      setMatch(matchResult);

    } catch (err) {
      setAnalyzeError(err.message || 'Analysis failed. Please try again.');
      setMatch(null);
    } finally {
      setLoadingText('');
    }
  }, [profile, analyzeJob, getMatch, clearError]);

  // Determine error to display
  const displayError = analyzeError || error || (!backendOnline ? 'Backend not running. Start with: make dev-backend' : null);

  return (
    <div className="w-[380px] bg-slate-900 text-slate-100 flex flex-col max-h-[560px]">
      {/* Header */}
      <header className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex justify-between items-center shrink-0">
        <h1 className="text-lg font-semibold text-slate-100">JobFitCheck</h1>
        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
          v{version}
        </span>
      </header>

      {/* Error Banner */}
      {displayError && <ErrorBanner message={displayError} onDismiss={() => setAnalyzeError(null)} />}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <ProfileSection
          profile={profile}
          loading={loading && loadingText.includes('Upload')}
          onUpload={handleUpload}
          onClear={handleClear}
        />

        {/* Divider */}
        <div className="h-px bg-slate-800 mx-4" />

        {/* Analyze Section */}
        <AnalyzeSection
          profile={profile}
          loading={loading && !loadingText.includes('Upload')}
          onAnalyze={handleAnalyze}
        />

        {/* Autofill Section */}
        {profile && <AutofillSection profile={profile} />}

        {/* Results Section */}
        {match && <ResultsSection match={match} />}

        {/* Tailored Documents Section */}
        {job && <DocumentsSection profile={profile} job={job} />}
      </div>

      {/* Footer */}
      <footer className="bg-slate-800 px-4 py-2 border-t border-slate-700 shrink-0">
        <p className="text-xs text-slate-400 text-center">
          Backend:{' '}
          <span className={backendOnline ? 'text-green-400' : 'text-red-400'}>
            {backendOnline ? 'Online' : 'Offline'}
          </span>
        </p>
      </footer>

      {/* Loading Spinner */}
      <Spinner text={loadingText} show={loading} />
    </div>
  );
}
