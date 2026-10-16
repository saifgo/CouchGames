import { render } from 'preact';
import { installCrashReporter } from '@couch/net';
import { App } from './App.js';
import './styles.css';

installCrashReporter('controller-web');
render(<App />, document.getElementById('app')!);
