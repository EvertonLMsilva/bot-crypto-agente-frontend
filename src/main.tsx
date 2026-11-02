import { mountApp } from './bootstrap';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Não foi encontrado o local de montagem da aplicação.');
const unmount = mountApp(container);
if (import.meta.hot) import.meta.hot.dispose(unmount);
