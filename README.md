# SimingShan.github.io

Personal website of **Siming Shan** — incoming Ph.D. student in Statistics &
Data Science at Yale University (Lu Group).

Live site: <https://simingshan.github.io>

## Structure

```
index.html            Homepage — about, publications, blog index
styles.css            Global editorial styles
blog/
  red-diffeq.html     Paper explainer: RED-DiffEq
  post.css            Blog-post styles
  widgets.js          Interactive canvas widget
assets/
  portrait.jpg        Profile photo
  featured.jpg        Featured / hero image
  fig/                Paper figures (PNG)
Images/               Source artwork (PDF originals)
```

Static HTML/CSS/JS — no build step. Served via GitHub Pages.

## Local preview

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
