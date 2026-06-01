@echo off
setlocal
cd /d "%~dp0"
dotnet publish .\TopmostKeeper.csproj -c Release -r win-x64 --self-contained true -o .\publish
if errorlevel 1 exit /b %errorlevel%
echo.
echo Build complete: %~dp0publish\TopmostKeeper.exe
pause
