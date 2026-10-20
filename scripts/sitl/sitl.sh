#!/usr/bin/env bash
# WSL 안에서 SITL 시작/중지. usage: sitl.sh start <tag> | stop
# 매번 빈 eeprom 으로 시작한다(기본값 상태). UART1 = TCP 5761.
set -u
case "${1:-}" in
  start)
    TAG="$2"
    pkill -f betaflight_SITL.elf 2>/dev/null; sleep 0.5
    RUN="$HOME/bf-sitl/run-$TAG"
    rm -rf "$RUN"; mkdir -p "$RUN"; cd "$RUN" || exit 1
    setsid nohup "$HOME/bf-sitl/$TAG/obj/main/betaflight_SITL.elf" > sitl.log 2>&1 < /dev/null &
    for i in $(seq 1 40); do
      if (exec 3<>/dev/tcp/127.0.0.1/5761) 2>/dev/null; then echo "SITL $TAG up (pid $(pgrep -f betaflight_SITL.elf | head -1))"; exit 0; fi
      sleep 0.25
    done
    echo "SITL $TAG did not open 5761"; tail -20 sitl.log; exit 1
    ;;
  stop)
    pkill -f betaflight_SITL.elf && echo "SITL stopped" || echo "no SITL running"
    ;;
  *) echo "usage: sitl.sh start <tag> | stop"; exit 2 ;;
esac
