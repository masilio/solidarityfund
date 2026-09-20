import uuid
import httpx
from app.config import settings
from app.payment_token import payment_token


class FlutterwaveClient:
    def __init__(self):
        self.token_manager = payment_token

    async def request(self, method: str, endpoint: str, data: dict | None = None) -> dict:
        token = await self.token_manager.get_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Trace-Id": str(uuid.uuid4()),
            "X-Idempotency-Key": str(uuid.uuid4()),
        }

        async with httpx.AsyncClient(base_url=settings.flutterwave_base_url, timeout=30.0) as client:
            response = await client.request(method, endpoint, headers=headers, json=data)
            response.raise_for_status()
            return response.json()

    async def post(self, endpoint: str, data: dict) -> dict:
        return await self.request("POST", endpoint, data)

    async def get(self, endpoint: str) -> dict:
        return await self.request("GET", endpoint)


flutterwave_client = FlutterwaveClient()