# Open public URLs

molx can open a structure file directly from a public HTTPS URL.

## Supported URL parameters

```text
?url=...
?src=...
?source=...
```

Example:

```text
https://molx.me/?url=https%3A%2F%2Fgithub.com%2Fyamnor%2Fmolx-data%2Fblob%2Fmain%2Fethylene.xyz
```

GitHub `blob` URLs are converted to raw content automatically.

## Display settings in the URL

Display settings can be combined with a public source URL:

```text
https://molx.me/?url=...&style=stick&label=atom
```

Common parameters:

| Parameter | Values |
| --- | --- |
| `style` | `ball-stick`, `stick`, `sphere`, `line`, `cartoon` |
| `color` | `element`, `chain`, `residue`, `single` |
| `label` | `off`, `atom`, `residue` |
| `surface` | `off`, `on` |
| `rotation` | `off`, `on` |
| `animation` | `off`, `on` |

## Requirements

The source URL must be:

- HTTPS
- publicly reachable
- on port 443
- a supported text-based structure format

Private network hosts and non-HTTPS URLs are rejected.
