import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/500.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

import './design-tokens.css';
import './index.css';
import './animations.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
