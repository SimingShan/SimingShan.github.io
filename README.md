# SimingShan.github.io

Personal website of **Siming Shan** — incoming Ph.D. student in Statistics &
Data Science at Yale University (Lu Group).

Live site: <https://simingshan.github.io>

## Structure

```
index.html              Homepage — about, publications, blog index
styles.css              Global styles
blog/
  red-diffeq.html       Paper explainer: RED-DiffEq
  shuimo.html           水墨 — the cat
  post.css              Shared blog-post styles
  widgets.js            Interactive canvas widget (RED-DiffEq post)
assets/
  portrait.jpg          Profile photo
  red-diffeq-cover.jpg  RED-DiffEq cover image
  cat/                  Photos of 水墨
```

`source/` holds original artwork (PDF figures, full-resolution photos). It is
git-ignored — kept locally, not published.

Static HTML/CSS — no build step. Served via GitHub Pages.

## Local preview

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
