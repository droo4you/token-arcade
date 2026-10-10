# Sounds

Drop the official files here and the game uses them automatically. Without them it
falls back to WebAudio synthesis, which is fully playable.

| File | Trigger | Notes |
|---|---|---|
| `button-tap.wav` | every catch | fires ~1/sec for minutes, keep under 80ms, no tail |
| `button-woo.wav` | whale buy | |
| `button-milestone.wav` | market cap milestone | |

MP3 or OGG preferred. WAV is uncompressed and roughly 10x larger. If you change the
format, update the `ASSETS` object at the top of `src/game.js`.
