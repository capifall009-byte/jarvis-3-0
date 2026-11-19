<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cc43be08-fd66-4640-b799-d7906a5d1043

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Studio vidéo — moteurs de rendu

Le Studio vidéo (`Générateur vidéo`) expose deux moteurs locaux :

- **Remotion** — compositions React/TS dans `remotion/`, rendues via `server/modules/reelRoute.ts`. Sorties : `public/reels/`.
- **Hyperframes** — compositions HTML/GSAP dans `hyperframes/<projet>/index.html`, rendues via `server/modules/hyperframesRoute.ts`. Sorties : `public/hyperframes/`.

Le projet d'exemple `hyperframes/exemple-portrait` est une bande-annonce JARVIS en 1080×1920.
Sur Windows, la CLI utilise automatiquement Edge ou Chrome installé ; sinon définir
`HYPERFRAMES_BROWSER_PATH` vers le binaire du navigateur. L'encodage utilise le FFmpeg
complet fourni par `ffmpeg-static` (le FFmpeg réduit de Remotion ne contient pas le filtre
`setparams` requis par Hyperframes) ; `HYPERFRAMES_FFMPEG_PATH` et
`HYPERFRAMES_FFPROBE_PATH` permettent de surcharger ces binaires.
