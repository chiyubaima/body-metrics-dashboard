#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "请先安装 Node.js 24 或更高版本。安装后关闭此窗口，再次双击启动身体日记。"
  echo "已为你打开官方下载页：https://nodejs.org/en/download"
  open 'https://nodejs.org/en/download'
  read -r -p "按回车关闭。" launcher_reply
  exit 1
fi
node scripts/launch.mjs
launcher_result=$?
if [ "$launcher_result" -ne 0 ]; then
  read -r -p "按回车关闭，处理上方提示后可再次双击。" launcher_reply
fi
exit "$launcher_result"
