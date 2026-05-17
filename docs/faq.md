# FAQ

## Does molx upload my structure data?

No. Registered links store the public source URL and metadata, not the structure file contents.

If you paste structure text directly into the editor, it is rendered locally in the browser and is not registered.

## Can I hide the source URL?

Yes. Source URLs are hidden from public viewers by default.

The owner can choose to make the source visible when registering or editing a link.

## Can viewers change the display?

Yes. Viewers can change the display locally through the command palette or URL parameters.

Only someone with the private edit URL can save display defaults to the registered link.

## Why does molx require HTTPS?

HTTPS-only fetching keeps source handling predictable and avoids several classes of server-side request risks.

## Can I use GitHub links?

Yes. GitHub `blob` URLs are converted to raw file URLs automatically.

## What should I use as a title?

Use a short molecule, project, or structure name. XYZ files can provide a title from their comment line; other formats usually benefit from an explicit title at registration time.
