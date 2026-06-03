import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { SkillChip } from './SkillChip';
import { SkeletonLoader } from './SkeletonLoader';
import { ErrorBanner } from './ErrorBanner';
import { ProfileEditor } from './ProfileEditor';

/**
 * ProfileUpload component - Section 1: Resume upload and profile display
 */
export function ProfileUpload() {
  const { profile, loading, error, uploadResume, clearProfile, deleteProfile, clearError } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(null);

  // Animate progress bar while loading; jump to 100 when done
  useEffect(() => {
    if (loading.profile) {
      setProgress(0);
      let current = 0;
      // Crawl quickly to 30% (pdf extraction), then slow down toward 90%
      progressRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) { clearInterval(progressRef.current); return 90; }
          const increment = prev < 30 ? 4 : prev < 60 ? 1.5 : 0.4;
          current = Math.min(90, prev + increment);
          return current;
        });
      }, 300);
    } else {
      clearInterval(progressRef.current);
      if (progress > 0) {
        setProgress(100);
        // Reset after animation
        setTimeout(() => setProgress(0), 1200);
      }
    }
    return () => clearInterval(progressRef.current);
  }, [loading.profile]);

  const parsedData = profile?.parsedData || {};
  const name = parsedData.personalInfo?.fullName || parsedData.name || null;
  const email = parsedData.personalInfo?.email || parsedData.email || null;
  const skills = parsedData.skills || [];
  const experience = parsedData.workExperience || parsedData.experience || [];
  const education = parsedData.education || [];
  const audit = parsedData._parseAudit || null;
  const confidence = parsedData.parseConfidence || null;

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        uploadResume(file);
      }
    }
  }, [uploadResume]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      uploadResume(file);
    }
  }, [uploadResume]);

  const handleReupload = useCallback(() => {
    clearProfile();
  }, [clearProfile]);

  return (
    <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">1</span>
        Your Profile
      </h2>

      {error.profile && (
        <ErrorBanner 
          message={error.profile} 
          onDismiss={() => clearError('profile')} 
        />
      )}

      {!profile ? (
        // Upload state
        <div>
          {loading.profile ? (
            <div className="py-6">
              {/* Stage labels */}
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>
                  {progress < 30 ? '📄 Extracting PDF text…'
                    : progress < 60 ? '🤖 AI parsing resume…'
                    : progress < 90 ? '🧠 Structuring data…'
                    : '✦ Finalising…'}
                </span>
                <span className="font-mono text-slate-300">{Math.round(progress)}%</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: progress === 100
                      ? '#4ade80'
                      : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">
                First run may take 30–60 s while the model loads into memory.
              </p>
            </div>
          ) : (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                  ${isDragOver 
                    ? 'border-indigo-500 bg-indigo-500/10' 
                    : 'border-slate-600 hover:border-slate-500'
                  }
                `}
              >
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="pdf-upload"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-slate-300 font-medium mb-1">
                    Drop your resume PDF here
                  </p>
                  <p className="text-slate-500 text-sm">
                    or click to browse (Max 5MB)
                  </p>
                </label>
              </div>
            </>
          )}
        </div>
      ) : (
        // Profile display state
        <div>
          {loading.profile ? (
            <SkeletonLoader lines={5} />
          ) : (
            <>
              {/* Delete confirmation modal */}
              {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-80 shadow-2xl">
                    <div className="text-3xl text-center mb-3">⚠️</div>
                    <h3 className="text-slate-100 font-semibold text-center mb-1">Delete Profile?</h3>
                    <p className="text-slate-400 text-sm text-center mb-5">
                      This will permanently remove your resume, parsed data, and all match history. This cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => { setConfirmDelete(false); await deleteProfile(); }}
                        className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                      >
                        Yes, delete
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Profile header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 mr-4">
                  <h3 className="text-xl font-bold text-slate-100 truncate">{name || 'Candidate'}</h3>
                  <p className="text-sm text-slate-400 truncate">{email || ''}</p>
                </div>

                {/* Action toolbar */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setShowEditor(true)}
                    title="Edit Profile"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-medium transition-colors border border-indigo-600/30"
                  >
                    ✏ Edit
                  </button>
                  <button
                    onClick={handleReupload}
                    title="Re-upload Resume"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 text-xs font-medium transition-colors border border-slate-600/40"
                  >
                    ↑ Re-upload
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Delete Profile"
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/60 hover:bg-red-900/40 text-slate-500 hover:text-red-400 text-sm transition-colors border border-slate-600/40 hover:border-red-800/40"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {showEditor && <ProfileEditor onClose={() => setShowEditor(false)} />}

              {/* Parse confidence + method banner */}
              {audit && (
                <div className={`rounded-lg px-3 py-2.5 mb-4 flex items-center gap-3
                  ${audit.parseMethod === 'regex'
                    ? 'bg-amber-900/20 border border-amber-800/30'
                    : 'bg-indigo-900/20 border border-indigo-800/20'}`}>

                  {/* Confidence pill */}
                  {confidence && (
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full
                      ${confidence.score >= 80
                        ? 'bg-green-900/50 text-green-300 border border-green-700/40'
                        : confidence.score >= 50
                        ? 'bg-amber-900/50 text-amber-300 border border-amber-700/40'
                        : 'bg-red-900/50 text-red-300 border border-red-700/40'}`}>
                      {confidence.score}% parsed
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-medium">
                        {audit.parseMethod === 'llm' ? '✦ AI-parsed' : '⚠ Regex-parsed'}
                      </span>
                      {confidence?.note ? ` — ${confidence.note}.` : '.'}
                      {' '}
                      <button
                        onClick={() => setShowEditor(true)}
                        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
                      >
                        Review &amp; edit
                      </button>
                      {' '}before using for applications.
                    </p>
                  </div>
                </div>
              )}

              {/* Skills */}
              {skills.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
                    Skills
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill, i) => (
                      <SkillChip key={i} label={skill} variant="neutral" />
                    ))}
                  </div>
                </div>
              )}

              {/* Experience Timeline */}
              {experience.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
                    Experience
                  </h4>
                  <div className="space-y-3">
                    {experience.slice(0, 3).map((exp, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                        <div>
                          <p className="font-medium text-slate-200">{exp.title}</p>
                          <p className="text-sm text-slate-400">
                              {exp.company}{(exp.startDate || exp.endDate) && ` • ${exp.startDate || ''}${exp.endDate ? ` – ${exp.endDate}` : ''}`}
                            </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
