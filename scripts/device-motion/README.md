# Device motion analysis (iOS simulator video → per-frame scroll steps)

`tr` has no ffmpeg, so simulator recordings are decoded with a small Swift AVFoundation frame
dumper and analysed with numpy phase correlation on a terrain crop. Written 2026-09-02 for the
build-70 "extremely laggy and jittery" investigation (the defect itself was two camera drivers
fighting; see `public/ui-overhaul.js` deactivate()).

```bash
xcrun swiftc -O -o scripts/device-motion/framedump scripts/device-motion/framedump.swift   # once
xcrun simctl io <udid> recordVideo --codec h264 --force /tmp/walk.mov &                   # then walk
kill -INT %1
python3 scripts/device-motion/video_motion.py /tmp/walk.mov --label fix --max 260
```

Output: per-frame dt, the longest walking segment, median scroll step (device px), duplicate frames
inside the walk, the share of frames whose step deviates > 25% from the median, and a step histogram.
Caveats: the simulator recorder captures 9-33 fps depending on host load, so it under-samples a
60 fps walk; random encounters end the walking segment; drive the stick with the simulator MCP's
`swipe` + `duration` (a `touch_path` dwell does not move the hero). The compiled `framedump` binary
is gitignored; rebuild it with the swiftc line above.
