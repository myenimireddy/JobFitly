import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000/api';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const checkBackend = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('http://localhost:3000/health', { signal: controller.signal });
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
      const response = await fetch(`${API_BASE}/profile/upload`, { method: 'POST', body: formData });
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

  return { loading, error, uploadResume, checkBackend, clearError };
}
