# SimingShan.github.io

Personal website of **Siming Shan** — incoming Ph.D. student in Statistics &
Data Science at Yale University (Lu Group).

Live site: <https://simingshan.github.io>

## Structure

```
index.html              Homepage — about, publications, blog index
home.css                Homepage styles (deep-space theme)
home.js                 A sheet of equations falling into a black hole; the
                        page falls in after it as you scroll
styles.css              Base styles for blog posts
blog/
  red-diffeq.html       Paper explainer: RED-DiffEq
  post.css              Shared blog-post styles
  night.css             Deep-space theme for blog posts
  widgets.js            Interactive canvas widget (RED-DiffEq post)
assets/
  portrait.jpg          Profile photo
  red-diffeq-cover.jpg  RED-DiffEq cover image
```

`source/` holds original artwork (PDF figures, full-resolution photos). It is
git-ignored — kept locally, not published.

Static HTML/CSS — no build step. Served via GitHub Pages.

## Local preview

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
