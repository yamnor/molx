# Register and share

Registering a URL creates a short molx link.

## What molx stores

molx stores:

- source URL
- file format
- optional title
- source visibility preference
- saved display defaults
- edit-token hash

molx does not store the structure file contents.

## Public URL

The public URL is for viewers:

```text
https://molx.me/abc123
```

Viewers can change styles locally through URL parameters or the command palette. Those changes do not modify the registered default.

## Edit URL

The edit URL is private:

```text
https://molx.me/abc123?edit=...
```

Use it to update:

- title
- source URL visibility
- saved display defaults

Keep the edit URL private. Anyone with the edit URL can update those link settings.

## Source visibility

Source URLs are hidden from public viewers by default. Enable source visibility only when you want viewers to see the original file location.
