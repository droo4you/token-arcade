#!/bin/bash
# Runs Skrumpey Slide through creator submit -> admin validate/approve -> creator deploy on a LOCAL_DEMO_MODE API.
set -e
A=${API:-http://127.0.0.1:8787}; C=${CART:-http://127.0.0.1:8788}
post(){ curl -sS -X POST "$A$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; echo; }
post /api/creator/games local-demo:droober "{\"manifest\":{\"id\":\"skrumpey-slide\",\"name\":\"Skrumpey Slide\",\"description\":\"Slide through four worlds, rescue Skrumpeys, and grow your train before nightfall.\",\"version\":\"1.3.0\",\"developer\":\"droo4you\",\"adapterId\":\"skrumpey-slide\",\"skeletonId\":\"skrumpey-slide\",\"supportedModes\":[\"free\",\"ranked\",\"raid\"],\"verifier\":{\"kind\":\"replay\",\"description\":\"Server replays the issued seed and sim.js input log at 60 Hz and recomputes score.\"},\"supportedObjectives\":[\"score\"],\"communityOptional\":true,\"minicoinOptional\":true,\"entry\":{\"kind\":\"iframe\",\"origin\":\"$C\",\"url\":\"$C/skrumpey-slide/v/1.3.0/\"},\"presentation\":{\"genre\":\"Momentum runner\",\"palette\":\"cyan\",\"glyph\":\"✦\"},\"controls\":{\"touch\":true,\"orientation\":\"any\"}}}"
post /api/admin/games/skrumpey-slide/validate local-demo:admin '{"builds":true,"mounts":true,"destroys":true,"resultSchema":true,"mobile":true,"sourceReviewed":true,"notes":"Local rehearsal"}'
post /api/admin/games/skrumpey-slide/approve local-demo:admin '{}'
post /api/creator/games/skrumpey-slide/deploy local-demo:droober '{}'
