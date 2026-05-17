@echo off
REM y_tube 렌더 서버 단독 기동 (node index.mjs, 포트 4000)
REM 작업 스케줄러(로그온 시) 자동 실행용. 수동 실행도 가능.

cd /d D:\Claude_works\y_tube\server
start "y_tube-server" /min cmd /c "node index.mjs"
exit
