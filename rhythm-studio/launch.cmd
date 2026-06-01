@echo off
start "" /min powershell -WindowStyle Hidden -Command "Start-Process python -ArgumentList '-m','http.server','4173','--bind','127.0.0.1','--directory','%~dp0' -WindowStyle Hidden"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173/"
