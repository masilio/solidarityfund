import time
import httpx
from app.config import settings


class PaymentToken:
    def __init__(self):
        self.token: str | None = None
        self.expires_at: float = 0

    async def refresh_token(self) -> str:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings.flutterwave_idp_url,
                data={
                    "client_id": settings.flutterwave_client_id,
                    "client_secret": settings.flutterwave_client_secret,
                    "grant_type": "client_credentials",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            data = response.json()

        self.token = data["access_token"]
        self.expires_at = time.time() + data["expires_in"]
        return self.token

    async def get_token(self) -> str:
        # 60s buffer so a token doesn't expire mid-request
        if self.token and time.time() < (self.expires_at - 60):
            return self.token
        return await self.refresh_token()


payment_token = PaymentToken()