from urllib.parse import urlparse
import re

from molx.config import EXTENSION_FORMATS, SUPPORTED_FORMATS


def is_float(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True


def is_valid_xyz_data(data: str) -> bool:
    lines = data.strip().splitlines()
    index = 0
    while index < len(lines):
        try:
            atom_count = int(lines[index].strip())
        except ValueError:
            return False
        if atom_count <= 0:
            return False

        index += 2
        if index + atom_count > len(lines):
            return False

        for _ in range(atom_count):
            if index >= len(lines):
                return False
            parts = lines[index].strip().split()
            if len(parts) < 4 or not all(is_float(value) for value in parts[1:4]):
                return False
            index += 1

    return bool(lines)


def is_valid_pdb_data(data: str) -> bool:
    for line in data.splitlines():
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        if len(line) >= 54 and all(
            is_float(value) for value in (line[30:38], line[38:46], line[46:54])
        ):
            return True
        parts = line.split()
        if len(parts) >= 9 and all(is_float(value) for value in parts[6:9]):
            return True
    return False


def parse_sdf_atom_count(counts_line: str) -> int | None:
    try:
        return int(counts_line[:3])
    except ValueError:
        parts = counts_line.split()
        if parts:
            try:
                return int(parts[0])
            except ValueError:
                return None
    return None


def is_valid_sdf_data(data: str) -> bool:
    records = [record for record in data.split("$$$$") if record.strip()]
    for record in records:
        lines = record.splitlines()
        atom_block_start = next(
            (index for index, line in enumerate(lines) if line.strip().upper() == "M  V30 BEGIN ATOM"),
            None,
        )
        if atom_block_start is not None:
            atom_lines = []
            for line in lines[atom_block_start + 1 :]:
                if line.strip().upper() == "M  V30 END ATOM":
                    break
                atom_lines.append(line)
            if any(
                len(line.split()) >= 7 and all(is_float(value) for value in line.split()[4:7])
                for line in atom_lines
            ):
                return True

        if len(lines) < 4:
            continue
        atom_count = parse_sdf_atom_count(lines[3])
        if not atom_count or atom_count <= 0 or len(lines) < 4 + atom_count:
            continue
        atom_lines = lines[4 : 4 + atom_count]
        if all(
            len(line.split()) >= 4 and all(is_float(value) for value in line.split()[:3])
            for line in atom_lines
        ):
            return True
    return False


def is_valid_mol2_data(data: str) -> bool:
    lines = data.splitlines()
    upper_lines = [line.upper() for line in lines]
    try:
        atom_start = upper_lines.index("@<TRIPOS>ATOM") + 1
    except ValueError:
        return False

    atom_end = len(lines)
    for index in range(atom_start, len(lines)):
        if upper_lines[index].startswith("@<TRIPOS>"):
            atom_end = index
            break

    atom_lines = [line for line in lines[atom_start:atom_end] if line.strip()]
    return any(
        len(line.split()) >= 6 and all(is_float(value) for value in line.split()[2:5])
        for line in atom_lines
    )


def is_valid_cif_data(data: str) -> bool:
    lowered = data.lower()
    return (
        re.search(r"(^|\n)\s*data_", lowered) is not None
        and "_atom_site." in lowered
        and (
            "_atom_site.cartn_x" in lowered
            or "_atom_site.fract_x" in lowered
        )
    )


def is_valid_cube_data(data: str) -> bool:
    lines = data.splitlines()
    if len(lines) < 6:
        return False
    try:
        atom_count = abs(int(lines[2].split()[0]))
        int(lines[3].split()[0])
        int(lines[4].split()[0])
        int(lines[5].split()[0])
    except (IndexError, ValueError):
        return False

    if atom_count <= 0 or len(lines) < 6 + atom_count:
        return False

    for line in lines[6 : 6 + atom_count]:
        parts = line.split()
        if len(parts) < 5 or not all(is_float(value) for value in parts[:5]):
            return False
    return True


FORMAT_VALIDATORS = {
    "xyz": is_valid_xyz_data,
    "pdb": is_valid_pdb_data,
    "sdf": is_valid_sdf_data,
    "mol2": is_valid_mol2_data,
    "cif": is_valid_cif_data,
    "cube": is_valid_cube_data,
}


def format_from_url(url: str) -> str | None:
    path = urlparse(url).path.lower()
    if path.endswith(".gz"):
        path = path[:-3]
    extension = path.rsplit(".", 1)[-1] if "." in path else ""
    return EXTENSION_FORMATS.get(extension)


def detect_structure_format(data: str, url: str = "") -> str | None:
    candidates = []
    url_format = format_from_url(url)
    if url_format:
        candidates.append(url_format)
    candidates.extend(format_name for format_name in SUPPORTED_FORMATS if format_name not in candidates)

    for format_name in candidates:
        if FORMAT_VALIDATORS[format_name](data):
            return format_name
    return None

