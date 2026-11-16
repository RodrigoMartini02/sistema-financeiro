@echo off
rem Encerra o painel local da coleta (o processo node que escuta na porta do painel). Uma coleta em andamento nao e afetada.
set "PANEL_PORT_TO_CLOSE=%PANEL_PORT%"
if not defined PANEL_PORT_TO_CLOSE set "PANEL_PORT_TO_CLOSE=3099"
powershell.exe -NoProfile -Command "$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort %PANEL_PORT_TO_CLOSE% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener -and (Get-Process -Id $listener.OwningProcess).ProcessName -eq 'node') { Stop-Process -Id $listener.OwningProcess -Force; 'Painel encerrado.' } else { 'O painel nao estava aberto.' }"
timeout /t 3 > nul
