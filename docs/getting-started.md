# Getting started

molx has two main ways to view a structure.

## Paste structure data

1. Open molx.
2. Paste XYZ, PDB, SDF, MOL2, CIF, or CUBE text into the editor.
3. Switch to the viewer.

This is local viewing. The pasted structure data is not uploaded or registered.

## Open a public file

Add a public HTTPS source file with the `url` query parameter:

```text
https://molx.me/?url=https%3A%2F%2Fgithub.com%2Fuser%2Frepo%2Fblob%2Fmain%2Fexample.xyz
```

`url`, `src`, and `source` are accepted as aliases.

## Create a short link

Use the Link dialog and register a public source URL. molx creates a six-character public code:

```text
https://molx.me/abc123
```

The private edit URL includes an edit token. Keep it private if you want to update the title, source visibility, or saved display defaults later.
