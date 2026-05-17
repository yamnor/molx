# molx documentation

molx is a lightweight web app for viewing, styling, and sharing molecular structures from public structure files.

It is designed around a simple rule: **structure data is not uploaded to molx**. A registered molx link stores only the public source URL, title, visibility preference, and display settings.

## What you can do

- Open public structure files with a URL parameter.
- Register a public source URL and create a short molx link.
- Paste structure data locally without saving it.
- Change molecular display styles from the command palette.
- Share a clean viewer URL with optional display settings.

## Quick example

Open a public structure file directly:

```text
https://molx.me/?url=https%3A%2F%2Fgithub.com%2Fyamnor%2Fmolx-data%2Fblob%2Fmain%2Fethylene.xyz
```

Register the source URL from the Link dialog to create a short URL such as:

```text
https://molx.me/abc123
```

## Core idea

molx is best for public, lightweight structure sharing:

- You keep the structure file in GitHub or another public HTTPS location.
- molx fetches it when a viewer opens the link.
- molx stores a short reference, not the structure payload.

For local inspection, paste structure text into the editor. Pasted data is rendered in your browser and is not registered unless you provide a public URL.
