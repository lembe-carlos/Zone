@echo off
chcp 65001 >nul
title CARLOS SHOP
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installez la version LTS depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b
)
echo Demarrage de CARLOS SHOP...
start "" http://localhost:3000
node --no-warnings server\index.js
pause
