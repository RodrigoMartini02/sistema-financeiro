---
name: run
description: Roda o projeto FinGerence local o mais rapido possivel. Use quando o usuario pedir para rodar/subir/iniciar o sistema local, abrir local, testar no localhost, ou mencionar porta 5173/3010. Sobe frontend Vite em 5173 e backend Express em 3010, reaproveitando o caminho conhecido do projeto.
---

# Run FinGerence Local

Objetivo: subir o FinGerence local rapidamente, sem dispersao.

## Projeto

- Caminho do projeto: `C:\Users\rodri\Music\Particular\sistema financas`
- Frontend: Vite na porta `5173`
- Backend: Express/tsx na porta `3010`
- Proxy do Vite: `/api -> http://localhost:3010`
- Frontend URL: `http://localhost:5173/`
- App/login usa a rota publica e chamadas `/api` via proxy.

## Fluxo rapido

1. Usar sempre o workdir do projeto:

   `C:\Users\rodri\Music\Particular\sistema financas`

2. Verificar portas antes de subir:

   `netstat -ano | Select-String ':5173|:3010'`

3. Se `5173` nao estiver escutando, subir frontend:

   `Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev','--','--host','127.0.0.1','--port','5173') -WorkingDirectory 'C:\Users\rodri\Music\Particular\sistema financas' -RedirectStandardOutput 'C:\tmp\fingerence-vite-5173.out.log' -RedirectStandardError 'C:\tmp\fingerence-vite-5173.err.log' -WindowStyle Hidden`

4. Se `3010` nao estiver escutando, subir backend:

   `Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev') -WorkingDirectory 'C:\Users\rodri\Music\Particular\sistema financas\backend' -RedirectStandardOutput 'C:\tmp\fingerence-backend-3010.out.log' -RedirectStandardError 'C:\tmp\fingerence-backend-3010.err.log' -WindowStyle Hidden`

5. Aguardar 3 a 5 segundos:

   `Start-Sleep -Seconds 4`

6. Confirmar portas:

   `netstat -ano | Select-String ':5173|:3010'`

7. Testar frontend:

   `curl.exe -I http://localhost:5173/`

8. Ler logs apenas se algo falhar:

   - `C:\tmp\fingerence-vite-5173.out.log`
   - `C:\tmp\fingerence-vite-5173.err.log`
   - `C:\tmp\fingerence-backend-3010.out.log`
   - `C:\tmp\fingerence-backend-3010.err.log`

## Regras

- Nao trocar porta sem necessidade. O padrao deste projeto e `5173` no frontend e `3010` no backend.
- Nao fazer build, commit, push, migration ou alteracao de arquivo para apenas rodar local.
- Nao alterar `.env`.
- Se o frontend subir mas login falhar, verificar primeiro se o backend esta em `3010`.
- Se o backend falhar, ler o log e informar objetivamente o erro.
- Se o backend conectar no PostgreSQL e exibir `SERVER STARTED`, informar que pode tentar login novamente.

## Resposta final esperada

Responder curto, com:

- frontend rodando ou nao;
- backend rodando ou nao;
- URL local `http://localhost:5173/`;
- observacao objetiva se houver erro de banco, porta ocupada ou proxy.
