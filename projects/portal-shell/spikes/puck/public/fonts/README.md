# Drop licensed font files here

`app/fonts.css` already declares the `@font-face` rules. Put the licensed
WOFF2 files in this folder using these exact names and the font appears with
no code change:

```
GEDinarOne-Light.woff2    (weight 300)
GEDinarOne-Medium.woff2   (weight 400)
GEDinarOne-Bold.woff2     (weight 700)
```

Until these files exist the browser 404s the request and falls through the
stack defined by the `font-family-base` token:

```
'GE Dinar One' → 'Noto Sans Arabic' → Tahoma → sans-serif
```

Nothing breaks; you just don't see GE Dinar yet.

## Licensing reminder

GE Dinar is proprietary — © Boutros International, all rights reserved.
A desktop/print licence does NOT cover webfont serving. Confirm the webfont
tier (permitted domains + pageview cap) with QDB brand/legal before this
reaches any public environment. Do not source the file from free-download
sites; they are unauthorised redistribution.

## Converting to WOFF2

If QDB supplies OTF/TTF, convert with `fonttools`:

```
pip install fonttools brotli
fonttools ttLib.woff2 compress GEDinarOne-Medium.otf
```

Do not subset Arabic aggressively — contextual forms (initial/medial/final/
isolated) and ligatures break if the glyph set is trimmed like Latin.
