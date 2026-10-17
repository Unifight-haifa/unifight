# Deploying and switching to unifight.co.il

The site's `site` and `base` come from two env vars, `SITE_URL` and `BASE_PATH`.
CI fills them from repo Variables, falling back to the github.io project URL, so
moving to the custom domain needs no file edits.

## First deploy

1. Create the GitHub repo. The name `unifight` is assumed. Any other name works in CI
   (the base follows the repo name), but the local default in `astro.config.mjs` and the
   `build:linkcheck` script assume `/unifight`, so update both if you pick another name.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push `main`. The workflow builds, runs `npm test`, link-checks the site under both
   `/unifight/` and `/`, and deploys only if all of that passes.

Then check (replace OWNER):

```sh
curl -sI https://OWNER.github.io/unifight/            # 200, root page that redirects in the browser
curl -sI https://OWNER.github.io/unifight/he/         # 200
curl -sI https://OWNER.github.io/unifight/ru/nope/    # 404
curl -s  https://OWNER.github.io/unifight/ru/nope/ | grep -c data-404   # 3, our trilingual 404
```

In a browser: `/unifight/` lands on your language, `/unifight/ru/nope/` shows the Russian
404, the switcher keeps the current page, and after switching to Russian a fresh visit to
`/unifight/` opens `/unifight/ru/`. Also open `/unifight/he/bidi/` on iOS Safari and Firefox
and compare with Chrome (`−60 kg`, `17:30–19:00`, `+972 …` must read left to right).

Pages caches for roughly 10 minutes, so a page that still looks old right after a deploy is
usually cache. `curl -I` shows what is actually served.

## Moving to unifight.co.il

1. Settings → Secrets and variables → Actions → Variables:
   `SITE_URL=https://unifight.co.il` and `BASE_PATH=/`.
2. DNS at the registrar:
   - apex `unifight.co.il`: A records `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`, and AAAA `2606:50c0:8000::153`,
     `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
     (check the current list in GitHub's "Managing a custom domain" docs)
   - `www`: CNAME to `OWNER.github.io`
3. Settings → Pages → Custom domain: `unifight.co.il`, wait for the DNS check, then tick
   **Enforce HTTPS**.
4. Re-run the workflow (Actions → Deploy to GitHub Pages → Run workflow) and repeat the
   checks above without the `/unifight` prefix.

No `public/CNAME` file is needed: with Actions deploys the custom domain lives in Settings.
To go back to github.io, delete the two Variables and re-run.
