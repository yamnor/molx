from fastapi import HTTPException

from molx.config import (
    MAX_ATOMS,
    MAX_CUBE_GRID_POINTS,
    MAX_MODELS,
    MAX_STRUCTURE_LINES,
)


def fail(message: str) -> None:
    raise HTTPException(status_code=400, detail=message)


def enforce_common_limits(data: str) -> list[str]:
    lines = data.splitlines()
    if len(lines) > MAX_STRUCTURE_LINES:
        fail("Structure file has too many lines")
    return lines


def enforce_xyz_limits(lines: list[str]) -> None:
    index = 0
    models = 0
    max_atoms_in_model = 0
    while index < len(lines):
        try:
            atom_count = int(lines[index].strip())
        except ValueError:
            return
        models += 1
        max_atoms_in_model = max(max_atoms_in_model, atom_count)
        index += atom_count + 2

    if models > MAX_MODELS:
        fail("Structure file has too many models")
    if max_atoms_in_model > MAX_ATOMS:
        fail("Structure file has too many atoms")


def enforce_pdb_limits(lines: list[str]) -> None:
    atom_count = sum(1 for line in lines if line.startswith(("ATOM  ", "HETATM")))
    model_count = sum(1 for line in lines if line.startswith("MODEL"))
    if atom_count > MAX_ATOMS:
        fail("Structure file has too many atoms")
    if model_count > MAX_MODELS:
        fail("Structure file has too many models")


def enforce_sdf_limits(data: str) -> None:
    records = [record for record in data.split("$$$$") if record.strip()]
    if len(records) > MAX_MODELS:
        fail("Structure file has too many records")

    for record in records:
        lines = record.splitlines()
        if len(lines) < 4:
            continue
        try:
            atom_count = int(lines[3][:3])
        except ValueError:
            parts = lines[3].split()
            if not parts:
                continue
            try:
                atom_count = int(parts[0])
            except ValueError:
                continue
        if atom_count > MAX_ATOMS:
            fail("Structure file has too many atoms")


def enforce_mol2_limits(lines: list[str]) -> None:
    upper_lines = [line.upper() for line in lines]
    try:
        molecule_start = upper_lines.index("@<TRIPOS>MOLECULE")
    except ValueError:
        return
    if molecule_start + 2 >= len(lines):
        return
    parts = lines[molecule_start + 2].split()
    if not parts:
        return
    try:
        atom_count = int(parts[0])
    except ValueError:
        return
    if atom_count > MAX_ATOMS:
        fail("Structure file has too many atoms")


def enforce_cif_limits(data: str) -> None:
    atom_like_lines = 0
    for line in data.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "_", "loop_", "data_")):
            continue
        parts = stripped.split()
        if len(parts) >= 3 and any(part.replace(".", "", 1).replace("-", "", 1).isdigit() for part in parts):
            atom_like_lines += 1
        if atom_like_lines > MAX_ATOMS:
            fail("Structure file has too many atoms")


def enforce_cube_limits(lines: list[str]) -> None:
    if len(lines) < 6:
        return
    try:
        atom_count = abs(int(lines[2].split()[0]))
        grid_counts = [abs(int(lines[index].split()[0])) for index in (3, 4, 5)]
    except (IndexError, ValueError):
        return
    if atom_count > MAX_ATOMS:
        fail("Structure file has too many atoms")

    grid_points = grid_counts[0] * grid_counts[1] * grid_counts[2]
    if grid_points > MAX_CUBE_GRID_POINTS:
        fail("CUBE grid is too large")


def enforce_structure_limits(data: str, format_name: str) -> None:
    lines = enforce_common_limits(data)
    if format_name == "xyz":
        enforce_xyz_limits(lines)
    elif format_name == "pdb":
        enforce_pdb_limits(lines)
    elif format_name == "sdf":
        enforce_sdf_limits(data)
    elif format_name == "mol2":
        enforce_mol2_limits(lines)
    elif format_name == "cif":
        enforce_cif_limits(data)
    elif format_name == "cube":
        enforce_cube_limits(lines)
