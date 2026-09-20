import uuid
from app.flutterwave_client import flutterwave_client


class PaymentService:
    def __init__(self):
        self.client = flutterwave_client

    async def create_customer(
        self, email: str, first_name: str, last_name: str,
        phone: str | None = None, country_code: str | None = None,
    ) -> dict:
        payload = {
            "email": email,
            "name": {"first": first_name, "last": last_name},
        }
        if phone and country_code:
            payload["phone"] = {"country_code": country_code, "number": phone}

        return await self.client.post("/customers", payload)

    async def create_mobile_money_method(self, country_code: str, network: str, phone: str) -> dict:
        return await self.client.post("/payment-methods", {
            "type": "mobile_money",
            "mobile_money": {
                "country_code": country_code,
                "network": network.upper(),
                "phone_number": phone,
            },
        })

    async def create_cardPayment_method(self,card_number: str, expiry_month: str, expiry_year: str, cvv: str,) -> dict:
        return await self.client.post("/payment-methods", {
            "type": "card",
            "card": {
                    "encrypted_card_number": card_number,
                    "encrypted_expiry_month": expiry_month,
                    "encrypted_expiry_year": expiry_year,
                    "encrypted_cvv":cvv,
                    "nonce":str(uuid.uuid4()),
            },
        })

    async def create_charge(
        self, customer_id: str, payment_method_id: str, amount: float, currency: str, redirect_url: str | None = None,
    ) -> dict:
        
        payload = {
            "currency": currency,
            "customer_id": customer_id,
            "payment_method_id": payment_method_id,
            "amount": amount,
            "reference": str(uuid.uuid4()),
        }
        if redirect_url:
             payload["redirect_url"] = redirect_url
        
        return await self.client.post("/charges",payload)


    async def pay_with_momo(
        self, email: str, first_name: str, last_name: str,
        phone: str, country_code: str, network: str,
        amount: float, currency: str,redirect_url: str | None = None,
    ) -> dict:
        
        customer = await self.find_customer_by_email(email)
        if not customer:
          customer = await self.create_customer(email, first_name, last_name, phone, country_code)
          
        customer_id = customer["id"]
        
        payment_method = await self.create_mobile_money_method(country_code, network, phone)
        return await self.create_charge(
            customer_id=customer_id,
            payment_method_id=payment_method["data"]["id"],
            amount=amount,
            currency=currency,
        )
        
    async def payment_with_card(
        self, email: str, first_name: str, last_name: str, phone: str, country_code: str, network: str,
         amount: float, currency: str,card_number: str, expiry_month: str, expiry_year: str, cvv: str,
        ) -> dict:
           
        customer = await self.find_customer_by_email(email)
        if not customer:
             customer = await self.create_customer(email, first_name, last_name, phone, country_code)
                 
        customer_id = customer["id"]
        
        payment_method = await self.create_cardPayment_method(card_number,expiry_month,expiry_year,cvv)
        return await self.create_charge(
                        customer_id=customer_id,
                        payment_method_id=payment_method["data"]["id"],
                        amount=amount,
                        currency=currency,
        )
        
    async def verify_charge(self, charge_id: str) -> dict:
         return await self.client.get(f"/charges/{charge_id}")
     
     
    async def find_customer_by_email(self, email: str) -> dict | None:
        result = await self.client.post(  "/customers/search?page=1&size=10",   {   "email": email,     },  )

        customers = result.get("data", [])

        if not customers:
            return None

        return customers[0]


payment_service = PaymentService()