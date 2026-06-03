import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Home } from './pages/Home';
import { SavedAnswers } from './pages/SavedAnswers';

/**
 * App root component with routing
 * Wraps the app with AppProvider for global state
 */
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
