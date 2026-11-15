@echo off
rem Abre o painel local da coleta de Licitacoes em http://localhost:3099 (so neste computador).
rem Deixe esta janela aberta enquanto usa o painel. Para os mesmos parametros da carga ja feita neste PC, defina antes
rem PANEL_DUCKDB_MEMORY_MB, PANEL_DISK_LIMIT_MB, PANEL_ENV_FILE e PANEL_WORK_DIR (veja o README de Licitacoes).
cd /d "%~dp0"
node main.mjs --open
if errorlevel 1 pause
