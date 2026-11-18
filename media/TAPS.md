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
The UI brush on buttons is still the old one. Cards and tiles have no sounds of their own any more (see below).

## Processing

`tools/taps/build-taps.py`: mono 48 kHz, gentle high-pass (140 to 250 Hz) and low-pass at 5.5 kHz,
trimmed tight (68 to 150 ms), natural decay kept with a short fade at the end, no reverb added,
levelled for a phone speaker and kept quiet. Encoded with ffmpeg: Opus 32 kbps (12 KB), MP3 48 kbps at 24 kHz (27 KB).

Hover and brush (sounds 11 to 16): high-pass at 180 Hz (hover) or 200 Hz (brush), pitched down by resampling
(0.83 to 0.92) for warmth, steep low-pass at 3 kHz (hover) or 3.8 kHz (brush) so there is no hiss, the cloth crinkle
partly evened out (the signal divided by its own envelope to a power: 0.75 hover, 0.45 brush), then a smooth
raised-cosine fade in and out with exact zero at both ends, so nothing clicks. Hover 241 to 259 ms, brush 80 to 85 ms.
No reverb, no synth. Sprite now: Opus 19 KB, MP3 41 KB.

## Hero button "Read the idea": liquid sprite

`media/liquid.ogg` (Opus 32 kbps, 27 KB) with `media/liquid.mp3` (MP3 48 kbps at 24 kHz, 57 KB). One sound every 0.8 s.
Real recorded water, no synth. All six recordings are CC0 (public domain) on Freesound. Built from the Freesound HQ previews.

| Source | Author | License | Used for |
|---|---|---|---|
| [Quick Water Droplet](https://freesound.org/people/qubodup/sounds/792931/) | qubodup | CC0 | press-1 |
| [Slow Single Water Drop Splash](https://freesound.org/people/qubodup/sounds/792932/) | qubodup | CC0 | press-2 |
| [water drop](https://freesound.org/people/florianreichelt/sounds/683102/) | florianreichelt | CC0 | press-3 |
| [small water drops](https://freesound.org/people/arseniiv/sounds/257349/) | arseniiv | CC0 | settle-1 |
| [water dribble](https://freesound.org/people/richwise/sounds/476838/) | richwise | CC0 | settle-2, settle-3 |
| [wave_ripple.aiff](https://freesound.org/people/borje/sounds/26472/) | borje | CC0 | swell-1 to 3, drain-1 to 3 |

| # | Name | Plays on | Length |
|---|---|---|---|
| 0 to 2 | press-1 to 3 | press: the squash and its ripple. A soft drop pitched down to a warm bloop, natural ripple tail kept | 230 to 380 ms |
| 3 to 5 | settle-1 to 3 | release: one tiny, softer drip as the spring settles (90 ms after release) | 130 to 170 ms |
| 6 to 8 | swell-1 to 3 | ink floods in from the pointer (mouse hover; on touch, quietly under the press). Gentle lapping water, 70 ms rise, long fall | 600 to 620 ms (flood is 850 ms) |
| 9 to 11 | drain-1 to 3 | ink drains (mouse leave; on touch, when the ink drains after the tap). The same water, lower and darker, easing in and out | 500 to 520 ms (drain is 650 ms) |

Processing (`tools/liquid/build-liquid.py`): mono 48 kHz, high-pass 120 to 160 Hz, pitched down by resampling
(0.66 to 1.0) for warmth, steep low-pass (3.6 kHz drops, 3 kHz drips, 2.4 kHz swell, 1.7 kHz drain) so there is no hiss,
smooth fades with exact zero at both ends, no reverb. Levelled for a phone speaker and kept quiet under the music; it never ducks it.
Each play picks a random variant (never the same twice in a row), with a random pitch change of +-3%, panned with the pointer.
Throttles: 120 ms for swell and drain, 60 ms for press (the old thump), 90 ms for release (the old ripple).
Loaded on the first tap on the button, else after the hero intro with the knocks. The wave button turns it off like all sounds.

## Cards and tiles

The cards and tiles no longer have their own lift knock, touch knock or brush. Every card and tile holds a 3D scene,
and the 3D scene's own tap, press, grab, drag, let-go, hover and brush sounds already play there, so the two doubled up.
