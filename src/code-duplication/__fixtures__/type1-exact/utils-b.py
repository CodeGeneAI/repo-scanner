import os
import json
from pathlib import Path


def load_config(config_path: str) -> dict:
    """Load configuration from a JSON file."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(path, "r") as f:
        data = json.load(f)

    required_keys = ["database", "cache", "logging"]
    for key in required_keys:
        if key not in data:
            raise ValueError(f"Missing required config key: {key}")

    if "port" in data:
        data["port"] = int(data["port"])

    if "debug" not in data:
        data["debug"] = os.environ.get("DEBUG", "false").lower() == "true"

    return data
