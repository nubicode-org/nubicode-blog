# Build, preview, ship, deploy, verify

## 0. Environment checks (once per session)

- **GitHub account**: `gh auth status --active` must show `fherrera-nubicode` (push access). Other accounts on this machine have read-only access → 403 on push. Switching is the owner's call: `gh auth switch --user fherrera-nubicode`. Never extract another account's token to work around it.
- **node_modules** may have been installed on linux-arm64 (missing `@rolldown/binding-darwin-arm64` → build crash). Fix without touching package.json/lockfile:
  `npm install --no-save --registry=https://registry.npmjs.org "@rolldown/binding-darwin-arm64@$(node -p "require('./node_modules/rolldown/package.json').version")"`
  (`--registry` because `~/.npmrc` points at an unrelated CodeArtifact registry.)

## 1. Work in a worktree from `origin/main`

```bash
git fetch origin
git worktree add -b content/<slug> ../nubicode-blog-<x> origin/main
ln -s ../nubicode-blog/node_modules ../nubicode-blog-<x>/node_modules
```
Remove when done: `rm ../nubicode-blog-<x>/node_modules && git worktree remove --force ../nubicode-blog-<x>`.

## 2. Build and check

```bash
npm run build
```
Then check what changed, e.g.:
- `grep -c '<item>' dist/rss.xml` (one item per published post), new item has absolute `https://blog.nubicode.com/images/...` URLs
- `grep -o 'og:image" content="[^"]*' dist/<slug>.html`
- schema errors (title > 70, description > 160) fail the build with `InvalidContentEntryDataError`.

## 3. Preview

`python3 -m http.server <port>` in `dist/` (run in background), open in the browser pane. Notes:
- Links like `/slug` 404 locally — the server doesn't add `.html` (CloudFront's function does in prod). Open `/slug.html`.
- Headless Chrome screenshots narrower than ~500px are clipped; check phone widths with the pane's mobile emulation and `document.documentElement.scrollWidth === innerWidth`.
- The service worker doesn't register on localhost (by design).

## 4. PR → merge → CI deploy

```bash
git add <explicit paths> && git commit -m "<type>: <summary>"   # attribution lines per session rules
git push -u origin <branch>
gh pr create --base main --head <branch> --title "..." --body "..."   # Summary + Test plan
```
Wait for the PR build **until it is no longer pending** (`gh pr checks --watch` can return early), then:
```bash
gh pr merge <n> --merge
# wait for the deploy run whose headSha == new origin/main, then:
gh run watch <id> --exit-status
```

## 5. Manual deploy (fallback / pre-merge hotfix)

Only when the owner asks or CI is unavailable:
```bash
npm run build && AWS_PROFILE=personal bash deploy-to-s3.sh nubicode-blog E22Z1GJFWMJJAP
```
(`bash` so it runs even on older checkouts where the file lost its executable bit; `AWS_PROFILE=personal` because the default profile's SSO session is often expired.) Then follow up with a PR so `main` matches what's live.

## 6. Verify live

CloudFront is invalidated on deploy; poll until the change shows, then check:
```bash
B=https://blog.nubicode.com
until curl -s $B/ | grep -q '<marker of the change>'; do sleep 3; done
curl -s -o /dev/null -w "%{http_code}\n" $B/<slug>
curl -s $B/rss.xml | grep -o '<item>' | wc -l
```

## Infra facts

- Bucket `nubicode-blog`, CloudFront `E22Z1GJFWMJJAP` (managed **CachingOptimized** — honors origin Cache-Control, ignores query strings), viewer-request function rewrites `/slug` → `/slug.html`. Terraform in `infra/` (state is local and untracked — don't commit it).
- Cache tiers set by `deploy-to-s3.sh`: `/_astro/*` immutable 1y; images/logos 1 day + SWR; html/xml/txt/`sw.js` revalidate every visit. Old `/_astro` files are never deleted on purpose.
- Service worker `public/sw.js`: network-first pages, cache-first `/_astro`, SWR images. Bump `VERSION` to drop all caches.
- CSS is minified with **esbuild** (`astro.config.mjs`): Lightning CSS drops the unprefixed `backdrop-filter` → no glass blur in Chrome/Edge. Don't switch back.
- Dates: `pubDate` is UTC midnight; always format with `formatDate()` from `src/lib/posts.js` (UTC) or pages show the previous day.
