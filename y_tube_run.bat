@echo off
chcp 65001 >nul
title y_tube run (close this window to stop)
cd /d D:\Claude_works\y_tube\server

echo ============================================================
echo  y_tube 로컬 서버 수동 런처
echo  - 렌더링 / 유튜브 업로드 / 블로그(로컬 LLM 켰을 때) 가능
echo  - 브라우저:  http://localhost:4000
echo  - 종료: 이 창을 닫거나 Ctrl+C
echo ============================================================
echo.

node index.mjs

echo.
echo (서버가 종료되었습니다. 아무 키나 누르면 창이 닫힙니다.)
pause >nul
