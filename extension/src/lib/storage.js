/**
 * Chrome storage helpers for JobFitCheck extension
 */

const PROFILE_KEY = 'profileId';

/**
 * Get stored profile ID
 * @returns {Promise<string|null>} Profile ID or null
 */
export async function getProfileId() {
  try {
    const data = await chrome.storage.local.get([PROFILE_KEY]);
    return data[PROFILE_KEY] || null;
  } catch (error) {
    console.error('Error reading profile ID:', error);
    return null;
  }
}

/**
 * Store profile ID
 * @param {string} id - Profile ID to store
 * @returns {Promise<void>}
 */
export async function setProfileId(id) {
  try {
    await chrome.storage.local.set({ [PROFILE_KEY]: id });
  } catch (error) {
    console.error('Error storing profile ID:', error);
    throw error;
  }
}

/**
 * Clear stored profile ID
 * @returns {Promise<void>}
 */
export async function clearProfileId() {
  try {
    await chrome.storage.local.remove([PROFILE_KEY]);
  } catch (error) {
    console.error('Error clearing profile ID:', error);
    throw error;
  }
}
