/**
 * Web app shell: routes + AppProvider.
 * Home = upload / edit / analyze; SavedAnswers = reused HITL answers.
 * Side Panel (extension) is the primary fill UX — keep API usage aligned.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Home } from './pages/Home';
import { SavedAnswers } from './pages/SavedAnswers';

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/saved-answers" element={<SavedAnswers />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
