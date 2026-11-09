import re
import secrets
from datetime import datetime, timezone

SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"]


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or secrets.token_hex(4)


def size_key(size: str) -> tuple[int, str]:
    s = size.upper()
    if s in SIZE_ORDER:
        return (SIZE_ORDER.index(s), s)
    if s.isdigit():  # waist sizes like 28, 30, 32
        return (100 + int(s), s)
    return (1000, s)


def sort_sizes(sizes) -> list[str]:
    return sorted(set(sizes), key=size_key)


def new_order_number() -> str:
    now = datetime.now(timezone.utc)
    return f"EK{now:%y%m%d}{secrets.randbelow(90000) + 10000}"
