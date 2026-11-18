# 3D tap sounds

`taps.ogg` (Opus) and `taps.mp3` (fallback) hold seventeen short sounds, one every 0.4 s.
They play when you touch a 3D scene: press, tap, grab, drag and let go, plus a gentle air push on hover
and a soft brush when a finger or pointer slides across a scene without grabbing.
They are real recorded foley, not synth. The UI sounds (buttons, links, the wave button) are not in here and did not change.

## Source and license

- **Pack:** "Impact Sounds" by Kenney (kenney.nl), https://kenney.nl/assets/impact-sounds (sounds 0 to 10)
- **Pack:** "RPG Audio" by Kenney (kenney.nl), https://kenney.nl/assets/rpg-audio (sounds 11 to 16: hover and brush)
- **License:** Creative Commons CC0 1.0 (public domain). https://creativecommons.org/publicdomain/zero/1.0/
- Both packs use this license. Credit is not required. It is given here anyway: thanks, Kenney.

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
| 11 | hover-1 | RPG Audio cloth1.ogg | hover over a 3D scene (gentle air push) |
| 12 | hover-2 | RPG Audio cloth2.ogg | hover |
| 13 | hover-3 | RPG Audio cloth3.ogg | hover |
| 14 | brush-1 | RPG Audio cloth4.ogg | slide across a 3D scene without a grab (soft cloth brush) |
| 15 | brush-2 | RPG Audio handleSmallLeather2.ogg | slide (soft fingertip-like brush) |
| 16 | brush-3 | RPG Audio handleSmallLeather.ogg | slide |

Pairs: the press is deeper than its tap, and the grab is deeper than its let-go.
Each play picks a random variant (never the same twice in a row) with a random pitch change of +-3%.
Hover: also a small random volume change, panned with the pointer, quieter than the taps, same 160 ms throttle as before.
Brush: louder, a bit higher and brighter (low-pass 1.8 to 3.8 kHz) when the slide is faster, same 75 ms throttle as before.
The UI brush on buttons, tiles and cards is still the old one and did not change.

## Processing

`tools/taps/build-taps.py`: mono 48 kHz, gentle high-pass (140 to 250 Hz) and low-pass at 5.5 kHz,
trimmed tight (68 to 150 ms), natural decay kept with a short fade at the end, no reverb added,
levelled for a phone speaker and kept quiet. Encoded with ffmpeg: Opus 32 kbps (12 KB), MP3 48 kbps at 24 kHz (27 KB).

Hover and brush (sounds 11 to 16): high-pass at 180 Hz (hover) or 200 Hz (brush), pitched down by resampling
(0.83 to 0.92) for warmth, steep low-pass at 3 kHz (hover) or 3.8 kHz (brush) so there is no hiss, the cloth crinkle
partly evened out (the signal divided by its own envelope to a power: 0.75 hover, 0.45 brush), then a smooth
raised-cosine fade in and out with exact zero at both ends, so nothing clicks. Hover 241 to 259 ms, brush 80 to 85 ms.
No reverb, no synth. Sprite now: Opus 19 KB, MP3 41 KB.
