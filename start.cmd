@echo off
chcp 65001 >nul
rem One-click launcher: starts the local HTTP server in this folder and opens the browser.

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有在 PATH 中找到 node，请先安装 Node.js 后再运行本脚本。
  pause
  exit /b 1
)

echo 正在启动本地服务器 http://127.0.0.1:4191/ ...
start "A320neo3D 本地服务器 - 关闭此窗口即可停止" cmd /k node serve.mjs

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4191/"

endlocal
