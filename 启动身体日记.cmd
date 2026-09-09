@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto install_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto install_node
node scripts\launch.mjs
if errorlevel 1 (
  echo 请根据上方提示处理后，再次双击启动。
  pause
  exit /b 1
)
exit /b 0
:install_node
echo 请先安装 Node.js 24 或更高版本，安装后再次双击启动身体日记。
start "" "https://nodejs.org/en/download"
pause
exit /b 1
