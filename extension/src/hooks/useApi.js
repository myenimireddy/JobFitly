import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000/api';

/**
 * Hook for API calls with loading and error state
 * @returns {Object} { loading, error, uploadResume, analyzeJob, getMatch, checkBackend, clearError }
 */
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Check if backend is running
   * @returns {Promise<boolean>}
   */
  const checkBackend = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('http://localhost:3000/health', {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }, []);

  /**
   * Upload resume PDF
   * @param {File} file - PDF file
   * @returns {Promise<Object>} Profile data
   */
  const uploadResume = useCallback(async (file) => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch(`${API_BASE}/profile/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      return result.data;
    } catch (err) {
      const message = err.message || 'Failed to upload resume';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Extract job from page content
   * @param {string} url - Job page URL
   * @param {string} html - Job page HTML/text content
   * @returns {Promise<Object>} Job data
   */
  const analyzeJob = useCallback(async (url, html) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/job/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, html })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Job extraction failed');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Job extraction failed');
      }

      return result.data;
    } catch (err) {
      const message = err.message || 'Failed to extract job';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get match analysis between profile and job
   * @param {string} profileId - Profile CUID
   * @param {string} jobId - Job CUID
   * @returns {Promise<Object>} Match data
   */
  const getMatch = useCallback(async (profileId, jobId) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, jobId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Match analysis failed');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Match analysis failed');
      }

      return result.data;
    } catch (err) {
      const message = err.message || 'Failed to analyze match';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Generate tailored resume bullets and/or cover letter
   * @param {string} profileId
   * @param {string} jobId
   * @param {'resume'|'cover_letter'|'both'} type
   */
  const generateDocuments = useCallback(async (profileId, jobId, type = 'both') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, jobId, type }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Document generation failed');
      }
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Document generation failed');
      return result.data;
    } catch (err) {
      setError(err.message || 'Failed to generate documents');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    uploadResume,
    analyzeJob,
    getMatch,
    generateDocuments,
    checkBackend,
    clearError
  };
}
