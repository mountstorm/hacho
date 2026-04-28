# hacho

> Every song has a shape. We draw it.

A Mountstorm Labs project.

Type a track. Hacho pulls its mood tags from Last.fm, runs them through a deterministic ASCII generator, and renders a downloadable card. Same song → same numbers → same art. Always.

---

## How it works

Click the `i` button in the app for the full breakdown. Short version:

1. **Words.** Last.fm has 20 years of human-written tags — `grunge`, `dreamy`, `melancholic`. We grab them.
2. **Numbers.** Each tag votes on four sliders — energy, valence, density, organicness. A song becomes four numbers.
3. **Shape.** Those numbers warp a noise field. Energetic = choppy. Sad = darkens at edges. Acoustic = blooms from center. Electronic = snaps to a grid.
4. **Ink.** Pick characters and colors that match. Print.

---

## Deploy your own

### 1. Get a Last.fm API key
Free at [last.fm/api/account/create](https://www.last.fm/api/account/create). 30 seconds. Copy the **API key**.

### 2. Push to GitHub
Make a public repo, drop the files in.

### 3. Import to Vercel
- Go to [vercel.com/new](https://vercel.com/new), import your repo
- **Before clicking Deploy**: open Environment Variables
- Name: `LASTFM_API_KEY`
- Value: your Last.fm key
- Click Add → Deploy

You get a URL like `hacho-yourname.vercel.app`.

---

## Project structure

```
hacho/
├── index.html         # the whole frontend, single file
├── api/
│   └── lastfm.js      # Vercel serverless proxy
├── vercel.json
└── README.md
```

No build step, no framework, no node_modules. Just plain JS, Canvas, CSS.

## Built-in protections

- API key in env var, never in source
- Last.fm method whitelist on the proxy
- Per-IP rate limit: 30/min
- Global cap: 5000/day
- Edge cache: 1 hour for popular tracks

## License

MIT.
