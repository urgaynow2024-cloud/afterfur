# AfterFur UI Icon Starter Pack

This archive contains editable 24×24 outline SVG icons for AfterFur.

## Contents
- `public/icons/afterfur/` — SVG files.
- `docs/afterfur-icons/ICON-INVENTORY.md` — names and suggested uses.
- `docs/afterfur-icons/preview.html` — local visual preview.

## Install
Extract this ZIP into the root of your AfterFur project (the same folder as `package.json`). Windows will merge the included `docs` and `public` folders with your existing folders. Then open `docs/afterfur-icons/preview.html` in a browser.

## Recommended for the actual React UI
Use `lucide-react` for production UI components if it is not already installed: `npm install lucide-react`. It supports tree-shaking and makes sizing/accessibility easier. Example:

```tsx
import { Search, Bell, Heart } from "lucide-react";

<Search size={20} strokeWidth={1.8} aria-hidden="true" />
<Bell size={20} strokeWidth={1.8} aria-hidden="true" />
<Heart size={20} strokeWidth={1.8} aria-hidden="true" />
```

These SVGs are a starter/reference set, not the complete official Lucide collection. Official catalogue: https://lucide.dev/icons/ . Lucide source and licence: https://github.com/lucide-icons/lucide .

Note: SVGs use `currentColor`; when used via an `<img>` tag the stroke may not inherit CSS colour. Inline SVG or React icon components are preferable when dynamic colour is needed.
