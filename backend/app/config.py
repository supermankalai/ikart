from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "iKart"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ekart"

    jwt_secret: str = "change-this-to-a-long-random-secret"
    jwt_expire_minutes: int = 60 * 24 * 7

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "uploads"
    max_upload_mb: int = 5

    admin_email: str = "admin@ikart.online"
    admin_password: str = "admin123"

    cashfree_env: str = "sandbox"
    cashfree_app_id: str = ""
    cashfree_secret_key: str = ""
    cashfree_api_version: str = "2023-08-01"

    shipping_provider: str = "manual"  # "manual" or "shiprocket"
    shipping_webhook_secret: str = ""

    # Shiprocket (Settings -> API -> Create API User in the Shiprocket panel)
    shiprocket_email: str = ""
    shiprocket_password: str = ""
    shiprocket_pickup_location: str = "Primary"  # exact name of the pickup address in Shiprocket
    shiprocket_pickup_pincode: str = ""  # optional; looked up from Shiprocket if empty
    shiprocket_base_url: str = "https://apiv2.shiprocket.in/v1/external"

    # Unpaid online orders older than this are cancelled and their stock released.
    pending_payment_expiry_minutes: int = 30

    @property
    def cashfree_enabled(self) -> bool:
        return bool(self.cashfree_app_id and self.cashfree_secret_key)

    @property
    def shiprocket_enabled(self) -> bool:
        return bool(self.shiprocket_email and self.shiprocket_password)

    @property
    def cashfree_base_url(self) -> str:
        if self.cashfree_env == "production":
            return "https://api.cashfree.com/pg"
        return "https://sandbox.cashfree.com/pg"

    @cached_property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
