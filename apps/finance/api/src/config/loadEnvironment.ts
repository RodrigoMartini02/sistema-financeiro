import { loadEnvironment } from './environment';

if (process.env.NODE_ENV !== 'production') {
  loadEnvironment();
}
