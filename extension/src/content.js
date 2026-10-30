/**
 * JobFitly content script — scrape the page, inject answers. Never clicks Submit.
 */
import { PortalEngine } from './portalEngine.js';

window.PortalEngine = PortalEngine;

const SCRIPT_VERSION = 'v2025-05-29-engine-3';

(function () {
  'use strict';

  // Re-injection guard
  if (window.__jobfitly_content_version__ === SCRIPT_VERSION) {
    console.log('[JobFitly] already active, skipping re-init');
    return;
  }
  window.__jobfitly_content_version__ = SCRIPT_VERSION;

  console.log('[JobFitly] content script loaded:', SCRIPT_VERSION);

  // ── Job page text extraction ────────────────────────────────────────────────

  const SITE_SELECTORS = {
    'linkedin.com': {
      container: ['.jobs-description__container', '.job-view-layout .description'],
      exclude: ['.jobs-description__company-name', 'nav', 'header']
    },
    'greenhouse.io': {
      container: ['#content', '.app-body', '[class*="job-description"]'],
      exclude: ['nav', 'header', '.navigation']
    },
    'lever.co': {
      container: ['.posting-content', '.posting-description'],
      exclude: ['.main-header', 'nav', 'header']
    },
    'myworkdayjobs.com': {
      container: ['[data-automation-id="job-posting-details"]'],
      exclude: ['nav', 'header']
    }
  };

  function getJobPageText() {
    const hostname = window.location.hostname;
    let config = { container: ['main', '[role="main"]', 'article', '#content'], exclude: ['nav', 'header', 'footer', 'aside'] };
    for (const [domain, cfg] of Object.entries(SITE_SELECTORS)) {
      if (hostname.includes(domain)) { config = cfg; break; }
    }
    let el = null;
    for (const sel of config.container) { el = document.querySelector(sel); if (el) break; }
    if (!el) el = document.body?.cloneNode(true);
    if (!el) return '';
    const clone = el.cloneNode(true);
    [...config.exclude, 'script', 'style', 'nav', 'header', 'footer', 'aside', 'button']
      .forEach(s => clone.querySelectorAll(s).forEach(x => x.remove()));
    return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isJobPage() {
    const hostname = window.location.hostname;
    const url = window.location.href.toLowerCase();
    const text = document.body?.innerText?.toLowerCase() || '';
    const knownSite = Object.keys(SITE_SELECTORS).some(d => hostname.includes(d));
    const hasPattern = ['job', 'careers', 'apply', 'position', 'opening'].some(p => url.includes(p));
    const hasKeywords = ['job description', 'responsibilities', 'requirements', 'qualifications', 'apply now'].some(kw => text.includes(kw));
    return knownSite || (hasPattern && hasKeywords);
  }

  // ── Message listener ────────────────────────────────────────────────────────

  function messageListener(request, sender, sendResponse) {
    if (window.__jobfitly_latest_instance__ !== SCRIPT_VERSION) {
      return false;
    }

    if (request.action === 'ping') {
      sendResponse({ version: SCRIPT_VERSION });
      return true;
    }

    if (request.action === 'getJobPageText' || request.action === 'getJobText') {
      if (!isJobPage()) {
        sendResponse({ success: false, error: 'Not a job posting page', isJobPage: false });
        return true;
      }
      sendResponse({ success: true, text: getJobPageText(), url: window.location.href, isJobPage: true, title: document.title });
      return true;
    }

    if (request.action === 'getPageProfileId') {
      sendResponse({ profileId: localStorage.getItem('jobfitcheck_profile_id') || null });
      return true;
    }

    if (request.action === 'setPageProfileId') {
      if (request.profileId) localStorage.setItem('jobfitcheck_profile_id', request.profileId);
      else localStorage.removeItem('jobfitcheck_profile_id');
      sendResponse({ ok: true });
      return true;
    }

    if (request.action === 'scrapeFormFields') {
      try {
        const fields = PortalEngine.scrape();
        console.log('[JobFitly] scraped', fields.length, 'fields');
        sendResponse({ fields, url: window.location.href, title: document.title });
      } catch (err) {
        console.error('[JobFitly] scrape error:', err);
        sendResponse({ fields: [], error: err.message });
      }
      return false;
    }

    if (request.action === 'injectAutofill') {
      const filled = PortalEngine.inject(request.answers || []);
      sendResponse({ filled });
      return true;
    }

    return true;
  }

  // Remove old listener, register new one
  if (window.__jobfitly_message_listener__) {
    chrome.runtime.onMessage.removeListener(window.__jobfitly_message_listener__);
  }
  window.__jobfitly_message_listener__ = messageListener;
  window.__jobfitly_latest_instance__ = SCRIPT_VERSION;
  chrome.runtime.onMessage.addListener(messageListener);

  console.log('[JobFitly] registered as latest instance', SCRIPT_VERSION);
})();
