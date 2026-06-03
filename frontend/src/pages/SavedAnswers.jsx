import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

/**
 * SavedAnswers page - displays all validated fields captured through extension
 */
export function SavedAnswers() {
  const { backendOnline } = useApp();
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('all');

  const API_BASE = 'http://localhost:3000/api';

  const fetchSavedAnswers = useCallback(async () => {
    try {
      // Try localStorage first, then 'current' to get latest profile, then hardcoded fallback
      let profileId = localStorage.getItem('jobfitcheck_profile_id');
      if (!profileId) {
        console.log('[SavedAnswers] No profileId in localStorage, trying current...');
        profileId = 'current';
      }
      
      // Hardcoded fallback for development
      if (profileId === 'current') {
        profileId = 'cmplb50cy00009d02ifya1l86';
        console.log('[SavedAnswers] Using hardcoded profileId:', profileId);
      }

      const response = await fetch(`${API_BASE}/autofill/saved-answers/${profileId}`);
      if (!response.ok) throw new Error('Failed to fetch saved answers');
      
      const data = await response.json();
      setAnswers(data.data?.answers || data.answers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedAnswers();
  }, [fetchSavedAnswers]);

  // Group answers by portal
  const groupedAnswers = answers.reduce((acc, answer) => {
    const portal = answer.portal || 'unknown';
    if (!acc[portal]) acc[portal] = [];
    acc[portal].push(answer);
    return acc;
  }, {});

  // Filter answers
  const filteredAnswers = answers.filter(answer => {
    const matchesSearch = answer.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         answer.answer?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPortal = selectedPortal === 'all' || answer.portal === selectedPortal;
    return matchesSearch && matchesPortal;
  });

  const portals = Object.keys(groupedAnswers);

  const getPortalIcon = (portal) => {
    const icons = {
      workday: '🏢',
      ashby: '🚀',
      lever: '💼',
      greenhouse: '🌱',
      generic: '📝'
    };
    return icons[portal] || '📝';
  };

  const getPortalName = (portal) => {
    const names = {
      workday: 'Workday',
      ashby: 'Ashby',
      lever: 'Lever',
      greenhouse: 'Greenhouse',
      generic: 'Generic'
    };
    return names[portal] || portal;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 64, maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', color: 'white' }}>
            JobFitCheck
          </span>
          <nav style={{ display: 'flex', gap: 24 }}>
            <a href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>
              Home
            </a>
            <a href="/saved-answers" style={{ color: 'var(--text-primary)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
              Saved Answers
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'white', marginBottom: 8 }}>
            Saved Form Answers
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
            Validated fields captured from job applications. These answers will be reused for future forms.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#4ade80' }}>{answers.length}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Total Saved Answers</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#60a5fa' }}>{portals.length}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Portals Used</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#f472b6' }}>
              {new Set(answers.map(a => a.label)).size}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Unique Fields</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search fields or answers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1, minWidth: 250,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: '12px 16px',
              color: 'white',
              fontSize: 14,
            }}
          />
          <select
            value={selectedPortal}
            onChange={(e) => setSelectedPortal(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: '12px 16px',
              color: 'white',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Portals</option>
            {portals.map(portal => (
              <option key={portal} value={portal}>
                {getPortalIcon(portal)} {getPortalName(portal)}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (confirm('Are you sure you want to clear all saved answers?')) {
                try {
                  const profileId = localStorage.getItem('jobfitcheck_profile_id') || 'cmplb50cy00009d02ifya1l86';
                  await fetch(`${API_BASE}/autofill/clear-answers/${profileId}`, { method: 'DELETE' });
                  setAnswers([]);
                } catch (err) {
                  console.error('Failed to clear answers:', err);
                }
              }
            }}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Clear All
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(248, 113, 113, 0.1)', border: '1px solid #f87171', borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <p style={{ color: '#f87171', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ color: 'var(--text-secondary)' }}>Loading saved answers...</div>
          </div>
        )}

        {/* Answers List */}
        {!loading && filteredAnswers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredAnswers.map((answer, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: 'rgba(74, 222, 128, 0.1)',
                        color: '#4ade80',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 500,
                        marginBottom: 8,
                      }}
                    >
                      {getPortalIcon(answer.portal)} {getPortalName(answer.portal)}
                    </span>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'white', margin: 0 }}>
                      {answer.label}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(answer.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete "${answer.label}"?`)) {
                          try {
                            const profileId = localStorage.getItem('jobfitcheck_profile_id') || 'cmplb50cy00009d02ifya1l86';
                            await fetch(`${API_BASE}/autofill/delete-answer/${profileId}`, {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ label: answer.label }),
                            });
                            setAnswers(answers.filter(a => a.label !== answer.label));
                          } catch (err) {
                            console.error('Failed to delete answer:', err);
                          }
                        }
                      }}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p style={{
                  fontSize: 15,
                  color: 'var(--text-secondary)',
                  margin: 0,
                  padding: '12px 16px',
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  borderLeft: '3px solid #4ade80',
                }}>
                  {answer.answer}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredAnswers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 64, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <h3 style={{ fontSize: 20, fontWeight: 600, color: 'white', marginBottom: 8 }}>
              No saved answers yet
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
              Fill out job applications using the extension. When you submit a form, your answers will be automatically saved here for future use.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-color)', marginTop: 48 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            JobFitCheck — AI-powered resume vs job fit analysis
          </p>
        </div>
      </footer>
    </div>
  );
}
