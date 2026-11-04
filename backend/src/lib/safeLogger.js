'use strict';

/** Raw resume, job, prompt, and model content is hidden unless explicitly enabled. */
const contentDebugEnabled = process.env.DEBUG_LLM_CONTENT === 'true';

function content(label, value) {
  if (!contentDebugEnabled) return;
  console.log(`[content-debug] ${label}:`, value);
}

module.exports = { content, contentDebugEnabled };
