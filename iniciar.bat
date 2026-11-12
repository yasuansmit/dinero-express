@echo off
title Servidor de Rifas Nequi
echo =======================================================
echo         SERVIDOR DE RIFAS NEQUI - INICIADO
echo =======================================================
echo.
echo 1. Tu plataforma esta corriendo en: http://localhost:3000
echo 2. Tu panel de organizadora esta en: http://localhost:3000/admin.html
echo.
echo Para compartir por WhatsApp fuera de tu casa o red Wi-Fi,
echo haz doble clic en el archivo: compartir-por-internet.bat
echo.
start http://localhost:3000
node server.js
pause
