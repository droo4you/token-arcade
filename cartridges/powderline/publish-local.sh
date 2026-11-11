#!/bin/bash
# Local demo only: creator submit, admin validate/approve, creator deploy.
# Requires LOCAL_DEMO_MODE on the API. Does not touch production.
set -euo pipefail
A=${API:-http://127.0.0.1:8787}
C=${CART:-http://127.0.0.1:8788}
post() { curl -sS -X POST "$A$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; echo; }
post /api/creator/games local-demo:droober "{\"manifest\":{\"id\":\"powderline\",\"name\":\"Powderline\",\"description\":\"Carve a mountain while an avalanche closes in. Tricks charge a boost that pulls you clear.\",\"version\":\"1.0.0\",\"developer\":\"droo4you\",\"adapterId\":\"powderline\",\"skeletonId\":\"powderline\",\"supportedModes\":[\"free\",\"ranked\"],\"verifier\":{\"kind\":\"replay\",\"description\":\"Server replays the issued seed and the 60 Hz input log in the frozen 1.0.0 sim and recomputes score, distance, trick points, combo, crashes, boosts and ticks.\"},\"supportedObjectives\":[\"score\"],\"playGuide\":{\"free\":\"Unlimited local runs. The arcade does not record them, and a host seed is ignored.\",\"ranked\":\"One run on the issued seed. Highest score wins.\",\"scoring\":\"Score is distance in whole meters plus trick points. A clean landing banks the trick at the current combo, then the combo climbs by one, up to x8. Bailing or hitting something resets the combo and costs speed.\",\"tieBreak\":\"Longer distance, then fewer crashes, then earlier acceptance and run id. Nothing is random.\"},\"communityOptional\":true,\"minicoinOptional\":true,\"entry\":{\"kind\":\"iframe\",\"origin\":\"$C\",\"url\":\"$C/powderline/v/1.0.0/\"},\"presentation\":{\"genre\":\"Downhill runner\",\"palette\":\"ink\",\"glyph\":\"△\"},\"controls\":{\"touch\":true,\"orientation\":\"any\"}},\"economy\":{\"status\":\"pending\",\"reason\":\"No economy is attached to Powderline.\"}}"
post /api/admin/games/powderline/validate local-demo:admin '{"builds":true,"mounts":true,"destroys":true,"resultSchema":true,"mobile":true,"sourceReviewed":true,"notes":"Local rehearsal"}'
post /api/admin/games/powderline/approve local-demo:admin '{}'
post /api/creator/games/powderline/deploy local-demo:droober '{}'
