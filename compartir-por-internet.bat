@echo off
title Enlace Publico para WhatsApp - Rifa Nequi
echo =======================================================
echo    Generando Enlace Publico HTTPS para tu WhatsApp
echo =======================================================
echo.
echo Conectando con Cloudflare Tunnel...
echo.
cloudflared tunnel --url http://localhost:3000
pause
