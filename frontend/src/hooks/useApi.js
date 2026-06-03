import { useCallback, useMemo } from 'react';

const API_BASE = 'http://localhost:3000/api';

/**
 * Hook for API calls using native fetch
 * Returns functions that always resolve to { data, error } — never throw
 */
export function useApi() {
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
   * Fetch profile by ID
   * @param {string} id - Profile ID
   * @returns {Promise<{data: Object|null, error: string|null}>}
   */
  const fetchProfile = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_BASE}/profile/${id}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        return { data: null, error: errorData.error || 'Failed to fetch profile' };
      }

      const result = await response.json();
      
      if (result.success) {
        return { data: result.data, error: null };
      } else {
        return { data: null, error: result.error || 'Failed to fetch profile' };
      }
    } catch (err) {
      return { data: null, error: err.message || 'Network error' };
    }
  }, []);

  /**
   * Upload resume PDF
   * @param {File} file - PDF file
   * @returns {Promise<{data: Object|null, error: string|null}>}
   */
  const uploadResume = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch(`${API_BASE}/profile/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { data: null, error: errorData.error || 'Upload failed' };
      }

      const result = await response.json();
      
      if (result.success) {
        return { data: result.data, error: null };
      } else {
        return { data: null, error: result.error || 'Upload failed' };
      }
    } catch (err) {
      return { data: null, error: err.message || 'Network error' };
    }
  }, []);

  /**
   * Extract job from URL or raw text
   * @param {string} url - Job URL
   * @param {string} html - Job HTML/text content
   * @returns {Promise<{data: Object|null, error: string|null}>}
   */
  const extractJob = useCallback(async (url, html) => {
    try {
      const response = await fetch(`${API_BASE}/job/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, html })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { data: null, error: errorData.error || 'Job extraction failed' };
      }

      const result = await response.json();
      
      if (result.success) {
        return { data: result.data, error: null };
      } else {
        return { data: null, error: result.error || 'Job extraction failed' };
      }
    } catch (err) {
      return { data: null, error: err.message || 'Network error' };
    }
  }, []);

  /**
   * Run match analysis
   * @param {string} profileId - Profile ID
   * @param {string} jobId - Job ID
   * @returns {Promise<{data: Object|null, error: string|null}>}
   */
  const runMatch = useCallback(async (profileId, jobId) => {
    try {
      const response = await fetch(`${API_BASE}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, jobId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { data: null, error: errorData.error || 'Match analysis failed' };
      }

      const result = await response.json();
      
      if (result.success) {
        return { data: result.data, error: null };
      } else {
        return { data: null, error: result.error || 'Match analysis failed' };
      }
    } catch (err) {
      return { data: null, error: err.message || 'Network error' };
    }
  }, []);

  /**
   * Update profile parsedData (user edits)
   * @param {string} id - Profile ID
   * @param {Object} parsedData - Updated parsedData object
   * @returns {Promise<{data: Object|null, error: string|null}>}
   */
  const updateProfile = useCallback(async (id, parsedData) => {
    try {
      const response = await fetch(`${API_BASE}/profile/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { data: null, error: errorData.error || 'Update failed' };
      }
      const result = await response.json();
      return result.success
        ? { data: result.data, error: null }
        : { data: null, error: result.error || 'Update failed' };
    } catch (err) {
      return { data: null, error: err.message || 'Network error' };
    }
  }, []);

  /**
   * Delete a profile permanently
   * @param {string} id - Profile ID
   * @returns {Promise<{error: string|null}>}
   */
  const deleteProfile = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_BASE}/profile/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        return { error: errorData.error || 'Delete failed' };
      }
      return { error: null };
    } catch (err) {
      return { error: err.message || 'Network error' };
    }
  }, []);

  return useMemo(() => ({
    checkBackend,
    fetchProfile,
    uploadResume,
    extractJob,
    runMatch,
    updateProfile,
    deleteProfile,
  }), [checkBackend, fetchProfile, uploadResume, extractJob, runMatch, updateProfile, deleteProfile]);
}
