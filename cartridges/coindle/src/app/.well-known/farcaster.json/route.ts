export async function GET() {
  const manifest = {
    accountAssociation: {
      header: "eyJmaWQiOjE4MjYyLCJ0eXBlIjoiYXV0aCIsImtleSI6IjB4NUM3NTk5ZDE4QTA0OTdGM0FGNDY1NzU3QjNEYjM5QzVkNDA2MjlGNiJ9",
      payload: "eyJkb21haW4iOiJjb2luZGxlLnh5eiJ9",
      signature: "NH3Sj1G3YZxY62UpvNncqsBds9IPNgbgKlts9w/n7sMZFt1TnkODz/ozOZZIRLCn7wD5L1LB29Xnn25vem1xnBw=",
    },
    miniapp: {
      version: "1",
      name: "Coindle",
      homeUrl: "https://coindle.xyz",
      iconUrl: "https://coindle.xyz/icon-1024.png",
      imageUrl: "https://coindle.xyz/og-image.png",
      splashImageUrl: "https://coindle.xyz/image.png",
      splashBackgroundColor: "#1A1F2B",
      subtitle: "Daily crypto guessing game",
      description:
        "Guess today's cryptocurrency powered by Pyth price feeds. 141 coins, live prices, 6 guesses. New puzzle every day!",
      primaryCategory: "games",
      tags: ["crypto", "wordle", "pyth", "daily", "game"],
    },
  };

  return Response.json(manifest);
}
