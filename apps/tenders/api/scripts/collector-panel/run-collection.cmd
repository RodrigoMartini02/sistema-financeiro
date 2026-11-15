@echo off
rem Roda a rotina diaria da coleta de Licitacoes (grava na PRODUCAO). Pede para digitar SIM e deixa a janela aberta no fim.
rem Use os mesmos parametros da carga ja feita neste PC: defina PANEL_DUCKDB_MEMORY_MB e PANEL_DISK_LIMIT_MB (veja o README de
rem Licitacoes) ou passe-os aqui. Parametros extras vao para o script, por exemplo:
rem   run-collection.cmd -EnvFile D:\coletor\collector.env -WorkDir D:\coletor
cd /d "%~dp0..\.."
set "COLLECTOR_LIMITS="
if defined PANEL_DUCKDB_MEMORY_MB set "COLLECTOR_LIMITS=%COLLECTOR_LIMITS% -DuckDbMemoryMb %PANEL_DUCKDB_MEMORY_MB%"
if defined PANEL_DISK_LIMIT_MB set "COLLECTOR_LIMITS=%COLLECTOR_LIMITS% -DiskLimitMb %PANEL_DISK_LIMIT_MB%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\run-collector-on-pc.ps1" -Mode daily%COLLECTOR_LIMITS% %*
echo.
pause
