"""
Amount extraction service using OpenAI GPT and Vision API
"""
import base64
import json
import re
from typing import Optional, Tuple, List, Dict
import httpx
from config import config


async def extract_expense_info(text: str) -> Tuple[Optional[float], Optional[str], Optional[str]]:
    """
    Extract amount, currency and description from text using GPT

    Returns:
        Tuple of (amount, currency, description) or (None, None, None) if not found
    """
    if not config.OPENAI_API_KEY:
        return None, None, None

    prompt = """Извлеки информацию о расходе из текста. Верни JSON:
- amount: число (сумма без валюты)
- currency: валюта (EUR, USD, RUB, по умолчанию EUR)
- description: краткое описание услуги/товара (2-4 слова)

Примеры:
"счёт за телефон 24 евро" -> {"amount": 24, "currency": "EUR", "description": "Телефон"}
"заплатил 150 долларов за интернет" -> {"amount": 150, "currency": "USD", "description": "Интернет"}
"бензин 50€" -> {"amount": 50, "currency": "EUR", "description": "Бензин"}
"чай 15" -> {"amount": 15, "currency": "EUR", "description": "Чай"}

Если нет данных: {"amount": null, "currency": null, "description": null}

Текст: """ + text

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0,
                    "max_tokens": 150
                }
            )

            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]

                json_match = re.search(r'\{[^}]+\}', content)
                if json_match:
                    data = json.loads(json_match.group())
                    amount = data.get("amount")
                    currency = data.get("currency", "EUR")
                    description = data.get("description")
                    if amount is not None:
                        return float(amount), currency, description
                    return None, None, description

            return None, None, None

    except Exception as e:
        print(f"Amount extraction error: {e}")
        return None, None, None


# Backward compatibility
async def extract_amount_from_text(text: str) -> Tuple[Optional[float], Optional[str]]:
    """Legacy function - returns only amount and currency"""
    amount, currency, _ = await extract_expense_info(text)
    return amount, currency


async def extract_multiple_expenses(text: str) -> List[Dict]:
    """
    Extract MULTIPLE expenses from text using GPT.
    Returns list of expenses: [{"amount": 200, "currency": "EUR", "description": "Окно", "payment_method": "cash"}, ...]
    """
    if not config.OPENAI_API_KEY:
        return []

    prompt = """Извлеки ВСЕ расходы из текста. Верни JSON массив.

Каждый расход:
- amount: число (сумма)
- currency: валюта (EUR, USD, RUB, по умолчанию EUR)
- description: краткое описание (1-3 слова)
- payment_method: способ оплаты (cash/card/transfer, null если не указано)

Примеры:
"бензин 50 евро и обед 30" -> [{"amount": 50, "currency": "EUR", "description": "Бензин", "payment_method": null}, {"amount": 30, "currency": "EUR", "description": "Обед", "payment_method": null}]
"окно 200 евро 100 евро работа оплачено кэшем" -> [{"amount": 200, "currency": "EUR", "description": "Окно", "payment_method": "cash"}, {"amount": 100, "currency": "EUR", "description": "Работа", "payment_method": "cash"}]
"заплатил картой за такси 15€" -> [{"amount": 15, "currency": "EUR", "description": "Такси", "payment_method": "card"}]

ВАЖНО: Если несколько сумм - верни несколько объектов!
Если нет расходов: []

Текст: """ + text

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0,
                    "max_tokens": 500
                }
            )

            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]

                # Find JSON array in response
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                    if isinstance(data, list):
                        # Validate and clean data
                        expenses = []
                        for item in data:
                            if isinstance(item, dict) and item.get("amount") is not None:
                                expenses.append({
                                    "amount": float(item.get("amount")),
                                    "currency": item.get("currency", "EUR"),
                                    "description": item.get("description"),
                                    "payment_method": item.get("payment_method")
                                })
                        return expenses

            return []

    except Exception as e:
        print(f"Multiple expenses extraction error: {e}")
        return []


async def extract_from_image(image_path: str) -> Tuple[Optional[float], Optional[str], Optional[str]]:
    """
    Extract amount, currency and description from image using GPT-4 Vision

    Returns:
        Tuple of (amount, currency, description)
    """
    if not config.OPENAI_API_KEY:
        return None, None, None

    try:
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        if image_path.lower().endswith(".png"):
            mime_type = "image/png"
        elif image_path.lower().endswith(".pdf"):
            return await extract_from_pdf(image_path)
        else:
            mime_type = "image/jpeg"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": """Проанализируй изображение (чек, счёт, квитанция).
Верни JSON:
- amount: итоговая сумма (Total/Итого)
- currency: валюта (EUR/USD/RUB)
- description: краткое описание услуги/товара (2-4 слова, например "Кофе", "Продукты", "Такси")

Пример: {"amount": 25.50, "currency": "EUR", "description": "Кофе и выпечка"}
Если не найдено: {"amount": null, "currency": null, "description": null}"""
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{image_data}"
                                    }
                                }
                            ]
                        }
                    ],
                    "max_tokens": 150
                }
            )

            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]

                json_match = re.search(r'\{[^}]+\}', content)
                if json_match:
                    data = json.loads(json_match.group())
                    amount = data.get("amount")
                    currency = data.get("currency", "EUR")
                    description = data.get("description")
                    if amount is not None:
                        return float(amount), currency, description
                    return None, None, description

            return None, None, None

    except Exception as e:
        print(f"Image extraction error: {e}")
        return None, None, None


# Backward compatibility
async def extract_amount_from_image(image_path: str) -> Tuple[Optional[float], Optional[str]]:
    """Legacy function - returns only amount and currency"""
    amount, currency, _ = await extract_from_image(image_path)
    return amount, currency


async def extract_from_pdf(pdf_path: str) -> Tuple[Optional[float], Optional[str], Optional[str]]:
    """
    Extract amount, currency and description from PDF
    """
    try:
        import pdfplumber

        text_content = ""
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:5]:
                page_text = page.extract_text()
                if page_text:
                    text_content += page_text + "\n"

        if not text_content.strip():
            print("PDF: No text extracted")
            return None, None, None

        text_content = text_content[:3000]
        return await extract_expense_info(text_content)

    except Exception as e:
        print(f"PDF extraction error: {e}")
        return None, None, None


# Backward compatibility
async def extract_amount_from_pdf(pdf_path: str) -> Tuple[Optional[float], Optional[str]]:
    """Legacy function - returns only amount and currency"""
    amount, currency, _ = await extract_from_pdf(pdf_path)
    return amount, currency
