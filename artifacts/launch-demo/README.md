# Kudium launch demo

`Kudium-Launch-Demo.mp4` is a 60-second, 1920×1080 H.264 video at 30 fps, with burned-in captions. It is silent: no music or voiceover. `captions.srt` is provided separately.

The footage uses production Kudium components, real native webpage views and a disposable copy of the fictional Atlas Studio project. Six source clips are retained in `raw/`, with verification details in `raw/launch-capture-manifest.json`. UI footage was sampled at 3 fps and assembled with camera close-ups and caption cards; it is not a 30 fps screen recording.

The editor saves a real comment in the disposable project copy. The terminal runs a real passing fixture test. The AI draft is unsent and has a real brief attached. Website hook entries are illustrative fixture data, labeled in the video. No invented AI response or signed-in personal account appears.

`assemble.py` reproduces the edit with ffmpeg and Pillow on this Mac. `capture-harness.cjs` records the capture recipe derived from the repository's demo-photography harness; dependencies resolve when placed temporarily in apps/browser/.erb/scripts and run from apps/browser with the renderer available on port 1212. Its output goes to artifacts/launch-demo/raw, not public website assets.

No website deployment, installer release or video publication was performed.
