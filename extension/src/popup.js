/**
 * JobFitCheck Extension Popup
 * Handles profile upload, job analysis, and match display
 */

const API_BASE = 'http://localhost:3000/api';

// DOM Elements
const elements = {
  loading: document.getElementById('loading'),
  errorBanner: document.getElementById('error-banner'),
  version: document.getElementById('version'),
  
  // Profile section
  uploadState: document.getElementById('upload-state'),
  profileState: document.getElementById('profile-state'),
  pdfUpload: document.getElementById('pdf-upload'),
  uploadBtn: document.getElementById('upload-btn'),
  clearProfile: document.getElementById('clear-profile'),
  profileName: document.getElementById('profile-name'),
  profileSkills: document.getElementById('profile-skills'),
  
  // Analyze section
  analyzeBtn: document.getElementById('analyze-btn'),
  analyzeHint: document.getElementById('analyze-hint'),
  
  // Results section
  resultsSection: document.getElementById('results-section'),
  matchScore: document.getElementById('match-score'),
  matchedSkills: document.getElementById('matched-skills'),
  missingSkills: document.getElementById('missing-skills'),
  recommendationsList: document.getElementById('recommendations-list'),
  
  // Footer
  backendStatus: document.getElementById('backend-status'),
};

// State
let profileId = null;
let isBackendOnline = false;

/**
 * Initialize popup on load
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Set version from manifest
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = `v${manifest.version}`;
  
  // Check backend status
  await checkBackendStatus();
  
  // Load saved profile
  await loadProfile();
  
  // Setup event listeners
  setupEventListeners();
});

/**
 * Check if backend is running
 */
async function checkBackendStatus() {
  try {
    const response = await fetch('http://localhost:3000/health', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      isBackendOnline = true;
      elements.backendStatus.textContent = 'Online';
      elements.backendStatus.classList.add('online');
      hideError();
    } else {
      throw new Error('Backend not responding');
    }
  } catch (error) {
    isBackendOnline = false;
    elements.backendStatus.textContent = 'Offline';
    showError('Backend not running. Start with: npm run dev');
  }
}

/**
 * Load profile from chrome.storage
 */
async function loadProfile() {
  const data = await chrome.storage.local.get(['profileId', 'profileName', 'profileSkills']);
  
  if (data.profileId) {
    profileId = data.profileId;
    elements.profileName.textContent = data.profileName || 'Unknown';
    elements.profileSkills.textContent = `${data.profileSkills || 0} skills`;
    showProfileState();
  } else {
    showUploadState();
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Upload button triggers file input
  elements.uploadBtn.addEventListener('click', () => {
    elements.pdfUpload.click();
  });
  
  // Handle file selection
  elements.pdfUpload.addEventListener('change', handleFileUpload);
  
  // Clear profile
  elements.clearProfile.addEventListener('click', clearProfile);
  
  // Analyze job
  elements.analyzeBtn.addEventListener('click', analyzeCurrentJob);
}

/**
 * Handle PDF file upload
 */
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!isBackendOnline) {
    showError('Cannot upload: Backend is not running. Start with: npm run dev');
    return;
  }
  
  showLoading('Uploading resume...');
  
  try {
    const formData = new FormData();
    formData.append('resume', file);
    
    const response = await fetch(`${API_BASE}/profile/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    
    // Save to storage
    const profile = result.data.profile;
    profileId = profile.id;
    
    await chrome.storage.local.set({
      profileId: profile.id,
      profileName: profile.name || 'Candidate',
      profileSkills: profile.skills?.length || 0
    });
    
    // Update UI
    elements.profileName.textContent = profile.name || 'Candidate';
    elements.profileSkills.textContent = `${profile.skills?.length || 0} skills`;
    showProfileState();
    hideError();
    
  } catch (error) {
    showError(`Upload failed: ${error.message}`);
    elements.profileName.textContent = '--';
    elements.profileSkills.textContent = '-- skills';
  } finally {
    hideLoading();
    // Reset file input
    elements.pdfUpload.value = '';
  }
}

/**
 * Clear saved profile
 */
async function clearProfile() {
  await chrome.storage.local.remove(['profileId', 'profileName', 'profileSkills']);
  profileId = null;
  showUploadState();
  hideResults();
  hideError();
}

/**
 * Analyze current job page
 */
async function analyzeCurrentJob() {
  if (!profileId) {
    showError('Upload your resume first');
    return;
  }
  
  if (!isBackendOnline) {
    showError('Backend not running. Start with: npm run dev');
    return;
  }
  
  showLoading('Extracting job...');
  
  try {
    // Get job text from content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const jobData = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'getJobPageText' }, resolve);
    });
    
    if (!jobData || !jobData.success) {
      const errorMsg = jobData?.error || 'Not a job posting page';
      throw new Error(`Cannot extract job: ${errorMsg}. Navigate to a job posting on LinkedIn, Greenhouse, Lever, or Workday.`);
    }
    
    // Extract job
    hideLoading();
    showLoading('Parsing job...');
    
    const jobResponse = await fetch(`${API_BASE}/job/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: jobData.url,
        html: jobData.text
      })
    });
    
    if (!jobResponse.ok) {
      const error = await jobResponse.json();
      throw new Error(error.error || 'Job extraction failed');
    }
    
    const jobResult = await jobResponse.json();
    
    if (!jobResult.success) {
      throw new Error(jobResult.error || 'Job extraction failed');
    }
    
    const jobId = jobResult.data.id;
    
    // Create match
    hideLoading();
    showLoading('Analyzing match...');
    
    const matchResponse = await fetch(`${API_BASE}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
        jobId
      })
    });
    
    if (!matchResponse.ok) {
      const error = await matchResponse.json();
      throw new Error(error.error || 'Match analysis failed');
    }
    
    const matchResult = await matchResponse.json();
    
    if (!matchResult.success) {
      throw new Error(matchResult.error || 'Match analysis failed');
    }
    
    // Display results
    displayResults(matchResult.data);
    hideError();
    
  } catch (error) {
    showError(error.message);
    hideResults();
  } finally {
    hideLoading();
  }
}

/**
 * Display match results
 */
function displayResults(data) {
  const result = data.resultData || data;
  
  // Score with color
  const score = result.matchScore || 0;
  elements.matchScore.textContent = score;
  elements.matchScore.className = 'score';
  
  if (score < 40) {
    elements.matchScore.classList.add('low');
  } else if (score < 70) {
    elements.matchScore.classList.add('medium');
  } else {
    elements.matchScore.classList.add('high');
  }
  
  // Matched skills (green chips)
  const matched = result.matchedSkills || [];
  elements.matchedSkills.innerHTML = matched.length
    ? matched.map(s => `<span class="chip">${escapeHtml(s)}</span>`).join('')
    : '<span class="hint">No matching skills found</span>';
  
  // Missing skills (red chips)
  const missing = result.missingSkills || [];
  elements.missingSkills.innerHTML = missing.length
    ? missing.map(s => `<span class="chip">${escapeHtml(s)}</span>`).join('')
    : '<span class="hint">No missing skills</span>';
  
  // Recommendations (numbered list)
  const recommendations = result.recommendations || [];
  elements.recommendationsList.innerHTML = recommendations.length
    ? recommendations.slice(0, 3).map((r, i) => 
        `<li><strong>${escapeHtml(r.gap)}</strong> — ${escapeHtml(r.suggestion)}</li>`
      ).join('')
    : '<li class="hint">No specific recommendations</li>';
  
  // Show results section
  elements.resultsSection.classList.remove('hidden');
}

/**
 * Hide results section
 */
function hideResults() {
  elements.resultsSection.classList.add('hidden');
  elements.matchedSkills.innerHTML = '';
  elements.missingSkills.innerHTML = '';
  elements.recommendationsList.innerHTML = '';
}

/**
 * UI State Helpers
 */
function showUploadState() {
  elements.uploadState.classList.remove('hidden');
  elements.profileState.classList.add('hidden');
  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.title = 'Upload your resume first';
  elements.analyzeHint.textContent = 'Upload your resume first';
}

function showProfileState() {
  elements.uploadState.classList.add('hidden');
  elements.profileState.classList.remove('hidden');
  elements.analyzeBtn.disabled = false;
  elements.analyzeBtn.title = '';
  elements.analyzeHint.textContent = 'Ready to analyze job postings';
}

function showLoading(text = 'Loading...') {
  elements.loading.querySelector('span').textContent = text;
  elements.loading.classList.remove('hidden');
}

function hideLoading() {
  elements.loading.classList.add('hidden');
}

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.classList.remove('hidden');
}

function hideError() {
  elements.errorBanner.classList.add('hidden');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
