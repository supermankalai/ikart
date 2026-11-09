from sqlalchemy.orm import Session

from ..models import StoreSetting
from ..schemas import StoreSettings

KEY = "store"


def get_store_settings(db: Session) -> StoreSettings:
    row = db.get(StoreSetting, KEY)
    if row and isinstance(row.value, dict):
        return StoreSettings(**{**StoreSettings().model_dump(), **row.value})
    return StoreSettings()


def save_store_settings(db: Session, data: StoreSettings) -> StoreSettings:
    row = db.get(StoreSetting, KEY)
    if row:
        row.value = data.model_dump()
    else:
        db.add(StoreSetting(key=KEY, value=data.model_dump()))
    db.commit()
    return data
