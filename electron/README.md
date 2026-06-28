# StudyVault Desktop (Electron)

StudyVault is a 100% browser-side app, so wrapping it as an Electron desktop app needs no code changes — just the two files in this folder plus a build pipeline.

## One-time setup

```bash
bun add -d electron @electron/packager
# or: npm install --save-dev electron @electron/packager
```

Add a `"main"` entry to `package.json` so Electron knows what to load:

```json
{
  "main": "electron/main.cjs"
}
```

## Run during development

```bash
bun run build          # produces dist/client + dist/server
npx electron .         # opens StudyVault in a native window
```

For live reload during UI development you can keep `bun run dev` running and instead load the dev server URL from `main.cjs` (replace `win.loadFile(...)` with `win.loadURL("http://localhost:3000")`).

## Package for distribution

Linux build:

```bash
npx vite build && \
  npx @electron/packager . StudyVault \
    --platform=linux --arch=x64 \
    --out=electron-release --overwrite \
    --ignore='node_modules' --ignore='^/src' --ignore='^/public' --ignore='^/electron-release'
```

macOS build (run from macOS or Linux):

```bash
npx @electron/packager . StudyVault --platform=darwin --arch=arm64 --out=electron-release --overwrite
```

Windows build:

```bash
npx @electron/packager . StudyVault --platform=win32 --arch=x64 --out=electron-release --overwrite
```

`@electron/packager` bundles its own Electron binary, so the resulting folder is self-contained.

## Notes

- The renderer is the same SPA served at `dist/client/index.html`. `vite.config.ts` does NOT need `base: './'` here because TanStack Start's client build is already root-relative; if you ever see a blank window, set `base: './'` in `vite.config.ts`.
- All persistence (IndexedDB), file downloads (File System Access API), and Google Drive fetches work inside Electron's Chromium with no changes.
