# Canyon Jump: first external creator handoff

## What the creator does

1. Sign in with the account that should own the cabinet at https://token-arcade.onrender.com/launch.
2. Choose **Submit a game**. Supply the game name, description, creator credit and HTTPS repository/source ZIP link. A preview URL is useful for review, but does not replace source.
3. Choose **Help me prepare the cartridge**, or take the generated prompt to a coding agent.
4. Describe Free Play. Request Passport Play and Community Raid independently if wanted. Describe the challenge, starting conditions, finish condition, scoring and tie-breaks. Mark unsettled decisions as needing help; reviewers must resolve them before approval.
5. Submit. This creates a private preparation request, not a public cabinet.
6. After review, inspect the configured descriptions and verifier on the approved submission. Use **Revise** if they differ from your intent. Only the submitting account can **Deploy**.

## What the arcade team does

- Agree on the challenge with the creator. Do not invent ranked mechanics from a Free Play build.
- Prepare bridge lifecycle handlers, device controls and score reporting; host an isolated versioned artifact on an approved origin.
- Configure the reviewed player-facing play guide and enabled modes. The original creator brief remains separate for comparison.
- Competitive play requires an installed matching verifier and issued rules; descriptions alone do not implement scoring or verification.
- Test the exact build, controls, pause/restart/cleanup and results; record evidence and approve. Free Play can publish while competitive integration remains pending, if the creator accepts that configuration.
- A changed published play guide requires a new build version. Existing active-run and raid guards still apply; revised configuration clears approval.

## Limits

This release adds the brief/configuration/review contract. It does not automatically package a repository, provision hosting, generate a trusted verifier, or implement Canyon Jump's gameplay. Canyon Jump's exact competitive format still belongs to its creator and reviewer to agree on.
