from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    admin_email: str
    admin_password: str
    page_size_default: int
    page_size_max: int

    flutterwave_client_id: str
    flutterwave_client_secret: str
    flutterwave_idp_url: str
    flutterwave_base_url: str
    flutterwave_webhook_hash: str
    backend_base_url: str
    frontend_base_url: str

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()