import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Board from './Board';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const board = params.get('board') === 'button';
const scenario = params.get('scenario') || 'default';
createRoot(document.getElementById('root')!).render(<StrictMode>{board ? <Board scenario={scenario} /> : <App />}</StrictMode>);
