# Collision impact sounds

`impacts.ogg` (Opus) and `impacts.mp3` (fallback) hold ten short knocks, one every 0.5 s.
They are real recorded foley, not synth.

## Source and license

- **Pack:** "Impact Sounds" by Kenney (kenney.nl), https://kenney.nl/assets/impact-sounds
- **License:** Creative Commons CC0 1.0 (public domain). https://creativecommons.org/publicdomain/zero/1.0/
- Credit is not required. It is given here anyway: thanks, Kenney.

## Variants

| # | Name | Kenney file | Used for |
|---|------|-------------|----------|
| 0 | wood-1 | impactWood_light_000.ogg | cubes, Noise box and cone |
| 1 | wood-2 | impactWood_light_002.ogg | cubes, Noise box and cone |
| 2 | wood-3 | impactWood_light_003.ogg | cubes, Noise box and cone |
| 3 | block-1 | impactPlank_medium_000.ogg | cubes; Intent cube (played lower) |
| 4 | block-2 | impactPlank_medium_004.ogg | cubes; Intent cube (played lower) |
| 5 | ceramic-1 | impactPlate_light_000.ogg | Noise sphere and knot |
| 6 | ceramic-2 | impactPlate_light_002.ogg | Noise sphere and knot |
| 7 | plastic-1 | impactGeneric_light_001.ogg | Noise torus and capsule |
| 8 | plastic-2 | impactGeneric_light_003.ogg | Noise torus and capsule |
| 9 | solid-1 | impactWood_medium_003.ogg | Intent cube |

## Processing

`tools/impacts/build-impacts.py`: mono 48 kHz, gentle high-pass (90 to 160 Hz) and low-pass at 5.5 kHz,
trimmed tight (85 to 280 ms), natural decay kept with a short fade at the end, no reverb added,
levelled for a phone speaker. Encoded with ffmpeg: Opus 32 kbps, MP3 48 kbps at 24 kHz.

## Also used in the music

The muted low wood ostinato in the perc stem (media/bgm-perc.*) uses solid-1 (pitched down to 0.8x) and wood-1
(0.62x and 0.66x), low-passed at 1.1 kHz. Same CC0 source. Script: tools/drums/drums_hypno.py.
