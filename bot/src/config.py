"""
Configuration for Expense Tracking Bot
"""
import os
from dataclasses import dataclass
from dotenv import load_dotenv

# Load .env file
load_dotenv()


@dataclass
class Config:
    """Bot configuration"""
    # Telegram
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")

    # OpenAI (for Whisper)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Database (MySQL)
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_NAME: str = os.getenv("DB_NAME", "")
    DB_USER: str = os.getenv("DB_USER", "")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")

    # Admin user IDs (comma-separated telegram IDs)
    ADMIN_IDS: str = os.getenv("ADMIN_IDS", "")

    # Allowed user IDs (comma-separated, empty = allow all authorized)
    ALLOWED_USER_IDS: str = os.getenv("ALLOWED_USER_IDS", "")

    # Upload directory
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")

    # Dropbox OAuth2
    DROPBOX_APP_KEY: str = os.getenv("DROPBOX_APP_KEY", "")
    DROPBOX_APP_SECRET: str = os.getenv("DROPBOX_APP_SECRET", "")
    DROPBOX_REFRESH_TOKEN: str = os.getenv("DROPBOX_REFRESH_TOKEN", "")
    DROPBOX_ACCESS_TOKEN: str = os.getenv("DROPBOX_ACCESS_TOKEN", "")  # Legacy/manual

    @property
    def DATABASE_URL(self) -> str:
        """Build MySQL connection URL"""
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"

    @property
    def admin_ids_list(self) -> list[int]:
        """Get list of admin telegram IDs"""
        if not self.ADMIN_IDS:
            return []
        return [int(x.strip()) for x in self.ADMIN_IDS.split(",") if x.strip()]

    @property
    def allowed_user_ids_list(self) -> list[int]:
        """Get list of allowed user telegram IDs"""
        if not self.ALLOWED_USER_IDS:
            return []
        return [int(x.strip()) for x in self.ALLOWED_USER_IDS.split(",") if x.strip()]


config = Config()


# Callback data prefixes for inline buttons
class CallbackPrefix:
    """Prefixes for callback data"""
    CONFIRM_TRANSCRIPTION = "confirm_trans"
    RETRY_TRANSCRIPTION = "retry_trans"
    CONFIRM_AMOUNT = "confirm_amt"
    EDIT_AMOUNT = "edit_amt"
    CATEGORY = "cat"
    SUBCATEGORY = "subcat"
    CANCEL = "cancel"
    BACK = "back"
    BACK_TO_SUBCATEGORY = "back_subcat"
    PAYMENT_CASH = "pay_cash"
    PAYMENT_BANK = "pay_bank"


# Messages
class Messages:
    """Bot messages in Russian"""
    WELCOME = (
        "Привет! Я бот для учёта расходов.\n\n"
        "Отправь мне:\n"
        "- Текст с описанием расхода\n"
        "- Фото чека/документа\n"
        "- PDF документ\n"
        "- Голосовое сообщение\n\n"
        "После этого я помогу выбрать категорию расхода."
    )

    NOT_AUTHORIZED = (
        "У вас нет доступа к этому боту.\n"
        "Обратитесь к администратору."
    )

    SELECT_CATEGORY = "Выберите категорию расхода:"
    SELECT_SUBCATEGORY = "Выберите подкатегорию:"

    VOICE_TRANSCRIPTION = (
        "Транскрибация голосового сообщения:\n\n"
        "_{transcription}_\n\n"
        "Всё верно?"
    )

    TRANSCRIPTION_CONFIRMED = "Отлично! Теперь выберите категорию расхода:"
    TRANSCRIPTION_RETRY = "Хорошо, отправьте голосовое сообщение ещё раз."

    EXPENSE_SAVED = (
        "Расход сохранён!\n\n"
        "Категория: *{category}*\n"
        "Подкатегория: *{subcategory}*\n"
        "Тип: {input_type}\n"
        "Дата: {date}"
    )

    CANCELLED = "Операция отменена."
    ERROR = "Произошла ошибка. Попробуйте ещё раз."

    PROCESSING_VOICE = "Обрабатываю голосовое сообщение..."
    PROCESSING_FILE = "Получил файл, обрабатываю..."
    PROCESSING_PHOTO = "Получил фото, обрабатываю..."

    # Admin messages
    USER_ADDED = "Пользователь {user} добавлен в список разрешённых."
    USER_REMOVED = "Пользователь {user} удалён из списка."
    USER_LIST = "Список пользователей:\n{users}"

    HELP = (
        "Команды:\n"
        "/start - Начать работу\n"
        "/help - Помощь\n"
        "/stats - Статистика расходов\n\n"
        "Админ команды:\n"
        "/adduser <telegram_id> - Добавить пользователя\n"
        "/removeuser <telegram_id> - Удалить пользователя\n"
        "/users - Список пользователей"
    )
