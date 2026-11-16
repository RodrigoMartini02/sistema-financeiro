@echo off
rem Abre o painel local da coleta de Licitacoes em http://localhost:3099 (so neste computador). O painel roda em segundo
rem plano, sem janela: esta janela fecha sozinha. Para encerrar o painel, use close-panel.cmd. Para os mesmos parametros da
rem carga ja feita neste PC, defina antes PANEL_DUCKDB_MEMORY_MB, PANEL_DISK_LIMIT_MB, PANEL_ENV_FILE e PANEL_WORK_DIR
rem (veja o README de Licitacoes).
cd /d "%~dp0"
node main.mjs --background --open
if errorlevel 1 pause
