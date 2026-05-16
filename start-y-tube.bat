@echo off
REM 오둥이 하루 — 서버 + ngrok 자동 기동 + 텔레그램으로 외부주소 통보
REM 작업 스케줄러(로그온 시) 등록용. 수동 실행도 가능.

cd /d D:\Claude_works\y_tube\server

REM 1) 렌더 서버 (포트 4000, 최소화 창)
start "y_tube-server" /min cmd /c "node index.mjs"

REM 2) ngrok 터널 (4000 -> 외부 https, 최소화 창)
start "y_tube-ngrok" /min cmd /c "D:\ngrok\ngrok.exe http 4000 --log=stdout"

REM 3) ngrok 기동 대기 후 현재 외부주소를 텔레그램으로 전송
timeout /t 12 /nobreak >nul
node notify-url.mjs

exit
