import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApiUrl } from './apiUrl';

test('endereço da API: em desenvolvimento, o proxy do Vite na porta 5173 e o servidor local nas outras', () => {
  assert.equal(resolveApiUrl({ hostname: 'localhost', port: '5173' }), '/api');
  assert.equal(resolveApiUrl({ hostname: '127.0.0.1', port: '5173' }), '/api');
  assert.equal(resolveApiUrl({ hostname: 'localhost', port: '3011' }), 'http://localhost:3011/api');
  assert.equal(resolveApiUrl({ hostname: '127.0.0.1', port: '' }), 'http://localhost:3011/api');
});

test('endereço da API: a base pública de Licitações tem prioridade e normaliza barras finais', () => {
  const configured = ' https://tenders.example.test/api/// ';
  assert.equal(resolveApiUrl({ hostname: 'fin-gerence.com.br', port: '' }, configured), 'https://tenders.example.test/api');
  assert.equal(resolveApiUrl({ hostname: 'localhost', port: '5173' }, configured), 'https://tenders.example.test/api');
  assert.equal(resolveApiUrl({ hostname: 'localhost', port: '5173' }, ' '), '/api');
});

test('endereço da API: fora do localhost, o backend de produção', () => {
  assert.equal(
    resolveApiUrl({ hostname: 'fin-gerence.com.br', port: '' }),
    'https://sistema-financeiro-backend-o199.onrender.com/api',
  );
  assert.equal(
    resolveApiUrl({ hostname: 'licitacoes-rfxl.onrender.com', port: '' }),
    'https://sistema-financeiro-backend-o199.onrender.com/api',
  );
});
