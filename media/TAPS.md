# 3D tap sounds

`taps.ogg` (Opus) and `taps.mp3` (fallback) hold eleven short sounds, one every 0.4 s.
They play when you touch a 3D scene: press, tap, grab, drag and let go.
They are real recorded foley, not synth. The UI sounds (buttons, links, the wave button) are not in here and did not change.

## Source and license

- **Pack:** "Impact Sounds" by Kenney (kenney.nl), https://kenney.nl/assets/impact-sounds
- **License:** Creative Commons CC0 1.0 (public domain). https://creativecommons.org/publicdomain/zero/1.0/
- Credit is not required. It is given here anyway: thanks, Kenney.

## Sounds

| # | Name | Kenney file | Used for |
|---|------|-------------|----------|
| 0 | press-1 | impactPunch_medium_000.ogg | press on a 3D scene (soft felt thump) |
| 1 | press-2 | impactPunch_medium_001.ogg | press |
| 2 | press-3 | impactPunch_medium_004.ogg | press |
| 3 | tap-1 | impactGeneric_light_000.ogg | tap on a 3D scene, also the tap that scatters the Noise shapes (light knock) |
| 4 | tap-2 | impactGeneric_light_002.ogg | tap |
| 5 | tap-3 | impactGeneric_light_004.ogg | tap |
| 6 | grab-1 | impactPunch_medium_002.ogg | grab a 3D object (felt grip) |
| 7 | grab-2 | impactPunch_medium_003.ogg | grab |
| 8 | let-1 | footstep_carpet_000.ogg | let go (light cloth brush); drag, quieter and a bit higher |
| 9 | let-2 | footstep_carpet_001.ogg | let go; drag |
| 10 | let-3 | footstep_carpet_003.ogg | let go; drag |

Pairs: the press is deeper than its tap, and the grab is deeper than its let-go.
Each play picks a random variant (never the same twice in a row) with a random pitch change of +-3%.

## Processing

`tools/taps/build-taps.py`: mono 48 kHz, gentle high-pass (140 to 250 Hz) and low-pass at 5.5 kHz,
trimmed tight (68 to 150 ms), natural decay kept with a short fade at the end, no reverb added,
levelled for a phone speaker and kept quiet. Encoded with ffmpeg: Opus 32 kbps (12 KB), MP3 48 kbps at 24 kHz (27 KB).
