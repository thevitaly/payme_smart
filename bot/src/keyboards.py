"""
Inline keyboards for the Expense Bot
"""
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from config import CallbackPrefix

# Category emojis mapping (match database codes)
CATEGORY_EMOJIS = {
    "JVK": "🏢",
    "HQ": "🏭",
    "CALLOUT": "🚗",
    "FS": "📁",
}

# Subcategory emojis mapping (match database codes, all unique)
SUBCATEGORY_EMOJIS = {
    # JVK Pro Service
    "JVK_RENT": "🏠",
    "JVK_SALARY": "💰",
    "JVK_ELECTRIC": "⚡",
    "JVK_MAINTENANCE": "🔧",
    "JVK_PARTS": "🔩",
    # HQ Local
    "HQ_MONTHLY": "📅",
    "HQ_EQUIPMENT": "🖥️",
    "HQ_PARTS": "⚙️",
    "HQ_PURCHASES": "🛒",
    "HQ_REPAIRS": "🔨",
    "HQ_OTHER": "📦",
    # Callout
    "CALL_SALARY": "💵",
    "CALL_FUEL": "⛽",
    "CALL_INSURANCE": "🛡️",
    "CALL_REPAIR": "🔨",
    # File Service
    "FS_SUBSCRIPTIONS": "📋",
    "FS_SALARY": "💳",
    "FS_OTHER": "📎",
}


def get_transcription_confirmation_keyboard(expense_id: int) -> InlineKeyboardMarkup:
    """Keyboard for confirming voice transcription"""
    keyboard = [
        [
            InlineKeyboardButton(
                "✅ Да, верно",
                callback_data=f"{CallbackPrefix.CONFIRM_TRANSCRIPTION}:{expense_id}"
            ),
            InlineKeyboardButton(
                "🔄 Записать заново",
                callback_data=f"{CallbackPrefix.RETRY_TRANSCRIPTION}:{expense_id}"
            ),
        ],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_categories_keyboard(categories: list, expense_id: int) -> InlineKeyboardMarkup:
    """
    Keyboard for selecting main category (2 buttons per row)
    """
    keyboard = []
    row = []

    for cat in categories:
        emoji = CATEGORY_EMOJIS.get(cat.code, "📂")
        row.append(
            InlineKeyboardButton(
                f"{emoji} {cat.name}",
                callback_data=f"{CallbackPrefix.CATEGORY}:{cat.id}:{expense_id}"
            )
        )
        if len(row) == 2:
            keyboard.append(row)
            row = []

    # Add remaining button if odd number
    if row:
        keyboard.append(row)

    return InlineKeyboardMarkup(keyboard)


def get_payment_type_keyboard(expense_id: int) -> InlineKeyboardMarkup:
    """
    Keyboard for selecting payment type (Cash/Bank)
    Final step before saving
    """
    keyboard = [
        [
            InlineKeyboardButton(
                "💵 Cash",
                callback_data=f"{CallbackPrefix.PAYMENT_CASH}:{expense_id}"
            ),
            InlineKeyboardButton(
                "🏦 Bank",
                callback_data=f"{CallbackPrefix.PAYMENT_BANK}:{expense_id}"
            ),
        ],
        [
            InlineKeyboardButton(
                "⬅️ Назад",
                callback_data=f"{CallbackPrefix.BACK_TO_SUBCATEGORY}:{expense_id}"
            )
        ]
    ]
    return InlineKeyboardMarkup(keyboard)


def get_subcategories_keyboard(
    subcategories: list,
    category_id: int,
    expense_id: int
) -> InlineKeyboardMarkup:
    """
    Keyboard for selecting subcategory (2 buttons per row)
    """
    keyboard = []
    row = []

    for subcat in subcategories:
        emoji = SUBCATEGORY_EMOJIS.get(subcat.code, "📌")
        row.append(
            InlineKeyboardButton(
                f"{emoji} {subcat.name}",
                callback_data=f"{CallbackPrefix.SUBCATEGORY}:{subcat.id}:{expense_id}"
            )
        )
        if len(row) == 2:
            keyboard.append(row)
            row = []

    # Add remaining button if odd number
    if row:
        keyboard.append(row)

    # Add back button
    keyboard.append([
        InlineKeyboardButton(
            "⬅️ Назад",
            callback_data=f"{CallbackPrefix.BACK}:{expense_id}"
        )
    ])

    return InlineKeyboardMarkup(keyboard)


def get_amount_confirmation_keyboard(expense_id: int, amount: float, currency: str) -> InlineKeyboardMarkup:
    """Keyboard for confirming extracted amount"""
    keyboard = [
        [
            InlineKeyboardButton(
                f"✅ Да, {amount} {currency}",
                callback_data=f"{CallbackPrefix.CONFIRM_AMOUNT}:{expense_id}"
            ),
            InlineKeyboardButton(
                "🔄 Нет",
                callback_data=f"{CallbackPrefix.RETRY_TRANSCRIPTION}:{expense_id}"
            ),
        ],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_voice_with_amount_keyboard(expense_id: int, amount: float, currency: str) -> InlineKeyboardMarkup:
    """Keyboard for voice message with extracted amount"""
    keyboard = [
        [
            InlineKeyboardButton(
                f"✅ Да, {amount} {currency}",
                callback_data=f"{CallbackPrefix.CONFIRM_TRANSCRIPTION}:{expense_id}"
            ),
            InlineKeyboardButton(
                "🔄 Нет",
                callback_data=f"{CallbackPrefix.RETRY_TRANSCRIPTION}:{expense_id}"
            ),
        ],
    ]
    return InlineKeyboardMarkup(keyboard)
