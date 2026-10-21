import { createRoot } from 'react-dom/client';
import { installCrashReporter } from '@couch/net';
import { App } from './App.js';
import './styles.css';
import './themes/pixel.css';
import './themes/neon.css';

installCrashReporter('host-web');
createRoot(document.getElementById('root')!).render(<App />);
