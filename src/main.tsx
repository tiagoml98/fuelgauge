import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { MockupA } from './mockups/MockupA';
import { MockupB } from './mockups/MockupB';

// D.1 direction mockups (static): /?mockup=a | /?mockup=b
const mockup = new URLSearchParams(window.location.search).get('mockup');
const root = mockup === 'a' ? <MockupA /> : mockup === 'b' ? <MockupB /> : <App />;

createRoot(document.getElementById('root')!).render(<StrictMode>{root}</StrictMode>);
