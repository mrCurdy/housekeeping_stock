import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { watchKeyboard } from './lib/keyboard';
import './styles/index.css';

watchKeyboard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
