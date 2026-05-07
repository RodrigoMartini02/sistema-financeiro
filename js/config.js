const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.ENVIRONMENT = isLocal ? 'development' : 'production';
window.API_URL = isLocal
    ? 'http://localhost:3010/api'
    : 'https://sistema-financeiro-backend-o199.onrender.com/api';
