import { useState, useCallback } from 'react';
import { getApiBase, getHealthUrl } from '../lib/apiConfig';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const checkBackend = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(await getHealthUrl(), { signal: controller.signal });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const uploadResume = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const response = await fetch(`${await getApiBase()}/profile/upload`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Upload failed');
      return result.data;
    } catch (err) {
      setError(err.message || 'Failed to upload resume');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Permanently delete profile (+ matches) on the local backend. */
  const deleteProfile = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${await getApiBase()}/profile/${id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Delete failed');
      }
      return true;
    } catch (err) {
      setError(err.message || 'Failed to delete profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /** @returns {Promise<Array<{ id: string, name: string, captureComplete?: boolean }>>} */
  const listProfiles = useCallback(async () => {
    const response = await fetch(`${await getApiBase()}/profile`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to list profiles');
    }
    return Array.isArray(result.data) ? result.data : [];
  }, []);

  /** Full profile by id (no /latest fallback). */
  const fetchProfile = useCallback(async (id) => {
    const response = await fetch(`${await getApiBase()}/profile/${id}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Profile not found');
    }
    return result.data;
  }, []);

  /** Explicit opt-in: newest profile on this backend. */
  const fetchLatestProfile = useCallback(async () => {
    const response = await fetch(`${await getApiBase()}/profile/latest`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'No profile on this backend yet');
    }
    return result.data;
  }, []);

  return {
    loading,
    error,
    uploadResume,
    deleteProfile,
    listProfiles,
    fetchProfile,
    fetchLatestProfile,
    checkBackend,
    clearError,
  };
}
