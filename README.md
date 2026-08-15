# Outlier Badge

[Türkçe](README.tr.md)

A Firefox extension that puts an outlier score on the corner of every YouTube
thumbnail. Score = the video's views divided by the **median** views of its
channel's last N videos. The median is a deliberate choice: a single viral video
would drag a mean upward and make everything else on that channel look like it
never outperformed. Shorts are scored against the channel's Shorts, regular
videos against regular videos, and live streams enter no pool at all. The watch
page also gets a panel with the score's details and the channel's recent view
distribution.

No server, no API key, no account: the extension calls YouTube's own internal
(InnerTube) endpoint from inside youtube.com, without session credentials. One
request per channel, cached in `storage.local` for 24 hours by default, and cards
are only processed once they scroll into view.

![Outlier scores on the YouTube home page](screenshots/home.webp)

![The watch page panel](screenshots/watch-panel.webp)

## Trying it out

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → the
`manifest.json` in this directory. It disappears when Firefox closes.

## Using it

The toolbar icon opens the settings: turn badges off, skip Shorts, pick the
baseline size (last 15/30/60/90 videos), hide scores below a threshold, set the
cache lifetime, choose the interface language, and clear the cache. The same
popup reports how many cards were scanned and scored in that tab, which is where
you look first when a badge fails to appear. The interface is available in
English and Turkish, following the browser's language by default.

To exercise the parsing and scoring logic without opening a browser, run
`node test/check.js` (it makes one real channel call too).

## Known limits

- YouTube hands out rounded view counts ("1.2M views"), so the score is an
  approximate ratio rather than an exact one.
- Videos under 7 days old have not gathered their views yet and score lower than
  they deserve. The dot next to the badge marks them.
- The baseline is the channel's last N videos, not its whole history. On a
  growing channel an old video scores higher than it should.
- Members-only videos never expose their view counts, so they neither join a
  baseline nor get a score.
- With fewer than 3 videos left in the pool no score is computed and no badge
  appears.
- InnerTube is an unofficial interface. If YouTube renames its fields the badges
  disappear; the page itself keeps working.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
