#!/usr/bin/env bash
# WSL 안에서 SITL 시작/중지. usage: sitl.sh start <tag> | stop | powercycle | status
#   start      : 빈 eeprom 으로 시작(기본값 상태). SITL 은 재부팅(save, exit)하면 프로세스가 끝나므로,
#                감시 루프가 같은 eeprom 으로 다시 띄운다 = 실제 FC 의 재부팅과 같다. UART1 = TCP 5761.
#   powercycle : SITL 프로세스만 죽인다 → 루프가 같은 eeprom 으로 다시 띄움 (USB 뽑았다 꽂기, 저장 안 한 값은 사라짐)
#   stop       : 루프와 SITL 모두 중지
set -u
LOOP_PID="$HOME/bf-sitl/loop.pid"
wait_port() {
  for i in $(seq 1 40); do
    if (exec 3<>/dev/tcp/127.0.0.1/5761) 2>/dev/null; then return 0; fi
    sleep 0.25
  done
  return 1
}
stop_all() {
  pkill -f sitl-loop 2>/dev/null
  rm -f "$LOOP_PID"
  pkill -x betaflight_SITL 2>/dev/null # 프로세스 이름(15자) 정확히 — -f 는 루프 자신의 명령줄까지 잡는다
  sleep 0.5
}
case "${1:-}" in
  start)
    TAG="$2"
    stop_all
    RUN="$HOME/bf-sitl/run-$TAG"
    rm -rf "$RUN"; mkdir -p "$RUN"; cd "$RUN" || exit 1
    ELF="$HOME/bf-sitl/$TAG/obj/main/betaflight_SITL.elf"
    # 루프 셸은 첫 인수 'sitl-loop' 로 찾는다 (stop)
    setsid nohup bash -c 'while true; do "$1" >> sitl.log 2>&1 < /dev/null; echo "[loop] SITL exited, restarting" >> sitl.log; sleep 0.3; done' sitl-loop "$ELF" > /dev/null 2>&1 &
    echo $! > "$LOOP_PID"
    if wait_port; then echo "SITL $TAG up (pid $(pgrep -x betaflight_SITL | head -1))"; exit 0; fi
    echo "SITL $TAG did not open 5761"; tail -20 sitl.log; exit 1
    ;;
  powercycle)
    pkill -x betaflight_SITL && echo "SITL killed (loop restarts it with the same eeprom)"
    sleep 0.5
    wait_port && echo "SITL back" || { echo "SITL did not come back"; exit 1; }
    ;;
  stop)
    stop_all
    echo "SITL stopped"
    ;;
  status)
    pgrep -ax betaflight_SITL || echo "not running"
    ;;
  *) echo "usage: sitl.sh start <tag> | stop | powercycle | status"; exit 2 ;;
esac
