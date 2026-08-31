# SAFI admin theme tokens (relied upon)

The admin pages under `src/pages/admin/` use these Tailwind tokens. They are
added to `tailwind.config.js` + `src/index.css` by the storefront branch
(SPEC §1). If a class renders unstyled, the token is missing there.

## Colors (`colors.safi.*`)
- `safi-black`   #0A0A0C — page background
- `safi-graphite` #141519 — card background
- `safi-panel`   #1B1C21 — raised panel / inputs
- `safi-line`    #26272D — borders
- `safi-red`     #E1261C — primary accent / CTA
- `safi-reddeep` #9C130C — CTA hover
- `safi-ice`     #F4F5F7 — primary text
- `safi-steel`   #9BA0AA — secondary text

## Fonts
- `font-display` — Barlow Condensed, italic, uppercase (headings, big numbers)
- `font-body` / default — Inter (body copy)

## Extras used from the approved demo
- `pulse-red` keyframe/utility — pulsing dot for "new order" / sync alerts
  (defined in demo `index.css` as `@keyframes pulse-red`; used as `pulse-red` class)
- `no-scrollbar` utility — hides scrollbars on horizontal chip rows
