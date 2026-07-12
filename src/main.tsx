import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import { ToastProvider } from './components/Toast';
import TipLayer from './components/Tip';
import 'goey-toast/styles.css';
import './index.css';
import './legacy.css';
import './additions.css';

// No StrictMode: its dev-only double-invocation of effects would open two SSE
// connections and double-apply live events.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <ToastProvider>
      <App />
      <TipLayer />
    </ToastProvider>
  </Provider>,
);
