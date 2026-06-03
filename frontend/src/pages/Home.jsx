import React from 'react';
import { Link } from 'react-router-dom';
import { ProfileUpload } from '../components/ProfileUpload';
import { JobAnalyzer } from '../components/JobAnalyzer';
import { MatchReport } from '../components/MatchReport';
import { useApp } from '../context/AppContext';

/**
 * Home page - renders all 3 sections
 */
export function Home() {
  const { backendOnline, llmStatus } = useApp();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header — matches site-header from career-ai-platform */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 64, maxWidth: 960, margin: '0 auto', padding: '0 24px',
        }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', color: 'white', cursor: 'pointer' }}>
              JobFitCheck
            </span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Link to="/" style={{ color: 'var(--text-primary)', textDecoration: 'none', fontSize: 14 }}>
              Home
            </Link>
            <Link to="/saved-answers" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>
              Saved Answers
            </Link>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Backend status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: backendOnline ? '#4ade80' : '#f87171',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {backendOnline ? 'Backend' : 'Backend Offline'}
              </span>
            </div>

            {/* LLM status */}
            {backendOnline && (
              <div title={llmStatus?.message || ''} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'help' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: llmStatus?.available ? '#4ade80' : '#f87171',
                  display: 'inline-block',
                }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {llmStatus?.available
                    ? `LLM (${llmStatus.provider})`
                    : 'LLM Offline'}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ProfileUpload />
          <JobAnalyzer />
          <MatchReport />
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-color)', marginTop: 48 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            JobFitCheck — AI-powered resume vs job fit analysis
          </p>
        </div>
      </footer>
    </div>
  );
}
