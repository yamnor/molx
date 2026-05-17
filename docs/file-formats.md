# File formats

molx supports these text-based structure formats:

| Format | Notes |
| --- | --- |
| XYZ | Uses the title/comment line when available |
| PDB | Defaults to Cartoon display |
| SDF | Supports common molecule records |
| MOL2 | Supports Tripos MOL2 atom blocks |
| CIF | Supports atom site coordinates |
| CUBE | Supports Gaussian CUBE atom coordinates |

## Limits

The public server applies limits for reliability:

- maximum file size
- maximum line count
- maximum atom count
- maximum model/frame count
- maximum CUBE grid points
- fetch timeout and redirect limits

These limits may be adjusted by the server operator in a self-hosted deployment.
