"""
Database models for Expense Tracking Bot
All tables have prefix 'payme_'
"""
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, BigInteger, String, DateTime, ForeignKey, Text, Boolean, Enum as SQLEnum, Numeric
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import enum

Base = declarative_base()


class InputType(enum.Enum):
    """Type of input received from user"""
    TEXT = "text"
    DOCUMENT = "document"
    PHOTO = "photo"
    VOICE = "voice"


class ExpenseStatus(enum.Enum):
    """Status of expense record"""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class PaymentType(enum.Enum):
    """Payment method"""
    CASH = "CASH"
    BANK = "BANK"


class User(Base):
    """Authorized users table"""
    __tablename__ = 'payme_users'

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(255), nullable=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    expenses = relationship("Expense", back_populates="user")


class Category(Base):
    """Main expense categories"""
    __tablename__ = 'payme_categories'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    order_num = Column(Integer, default=0)

    subcategories = relationship("Subcategory", back_populates="category")
    expenses = relationship("Expense", back_populates="category")


class Subcategory(Base):
    """Subcategories under main categories"""
    __tablename__ = 'payme_subcategories'

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey('payme_categories.id'), nullable=False)
    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    order_num = Column(Integer, default=0)

    category = relationship("Category", back_populates="subcategories")
    expenses = relationship("Expense", back_populates="subcategory")


class Expense(Base):
    """Main expenses table"""
    __tablename__ = 'payme_expenses'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('payme_users.id'), nullable=False)
    category_id = Column(Integer, ForeignKey('payme_categories.id'), nullable=True)
    subcategory_id = Column(Integer, ForeignKey('payme_subcategories.id'), nullable=True)

    # Input data
    input_type = Column(SQLEnum(InputType), nullable=False)
    original_text = Column(Text, nullable=True)
    transcription = Column(Text, nullable=True)
    file_id = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_name = Column(String(255), nullable=True)

    # Status
    status = Column(SQLEnum(ExpenseStatus), default=ExpenseStatus.PENDING)

    # Metadata
    description = Column(Text, nullable=True)
    amount = Column(Numeric(10, 2), nullable=True)  # Сумма расхода
    currency = Column(String(10), default='EUR')  # Валюта
    payment_type = Column(SQLEnum(PaymentType), nullable=True)  # Способ оплаты

    # Dropbox
    dropbox_url = Column(String(500), nullable=True)  # Ссылка на файл в Dropbox

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="expenses")
    category = relationship("Category", back_populates="expenses")
    subcategory = relationship("Subcategory", back_populates="expenses")


class PendingAction(Base):
    """Track pending user actions (for multi-step flows)"""
    __tablename__ = 'payme_pending_actions'

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    expense_id = Column(Integer, ForeignKey('payme_expenses.id'), nullable=True)
    action_type = Column(String(50), nullable=False)
    data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)


class InviteCode(Base):
    """One-time invite codes for user registration"""
    __tablename__ = 'payme_invites'

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    created_by = Column(BigInteger, nullable=False)  # Admin telegram_id
    used_by = Column(BigInteger, nullable=True)  # User telegram_id who used it
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)


def init_db(database_url: str):
    """Initialize database and create tables"""
    engine = create_engine(database_url, echo=False, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    return engine


def get_session(engine):
    """Create a new database session"""
    Session = sessionmaker(bind=engine)
    return Session()


def seed_categories(session):
    """Seed initial categories and subcategories"""

    categories_data = [
        {
            "name": "JVK Pro Service",
            "code": "JVK",
            "description": "JVK Pro Service expenses",
            "order_num": 1,
            "subcategories": [
                {"name": "Аренда", "code": "JVK_RENT", "order_num": 1},
                {"name": "Зарплата", "code": "JVK_SALARY", "order_num": 2},
                {"name": "Электричество", "code": "JVK_ELECTRIC", "order_num": 3},
                {"name": "Обслуживание", "code": "JVK_MAINTENANCE", "order_num": 4},
            ]
        },
        {
            "name": "HQ Local",
            "code": "HQ",
            "description": "HQ Local expenses",
            "order_num": 2,
            "subcategories": [
                {"name": "Аренда", "code": "HQ_RENT", "order_num": 1},
                {"name": "Оборудование", "code": "HQ_EQUIPMENT", "order_num": 2},
                {"name": "Детали", "code": "HQ_PARTS", "order_num": 3},
                {"name": "Покупки", "code": "HQ_PURCHASES", "order_num": 4},
                {"name": "Другое", "code": "HQ_OTHER", "order_num": 5},
            ]
        },
        {
            "name": "Callout (Выезды)",
            "code": "CALLOUT",
            "description": "Mobile/Field service expenses",
            "order_num": 3,
            "subcategories": [
                {"name": "Зарплата", "code": "CALL_SALARY", "order_num": 1},
                {"name": "Топливо", "code": "CALL_FUEL", "order_num": 2},
                {"name": "Страховка", "code": "CALL_INSURANCE", "order_num": 3},
                {"name": "Ремонт", "code": "CALL_REPAIR", "order_num": 4},
            ]
        },
        {
            "name": "File Service",
            "code": "FS",
            "description": "File Service expenses",
            "order_num": 4,
            "subcategories": [
                {"name": "Подписки", "code": "FS_SUBSCRIPTIONS", "order_num": 1},
                {"name": "Зарплата", "code": "FS_SALARY", "order_num": 2},
                {"name": "Другие расходы", "code": "FS_OTHER", "order_num": 3},
            ]
        },
    ]

    for cat_data in categories_data:
        # Check if category already exists
        existing = session.query(Category).filter_by(code=cat_data["code"]).first()
        if existing:
            continue

        subcats = cat_data.pop("subcategories")
        category = Category(**cat_data)
        session.add(category)
        session.flush()

        for subcat_data in subcats:
            subcat = Subcategory(category_id=category.id, **subcat_data)
            session.add(subcat)

    session.commit()


if __name__ == "__main__":
    # Test database initialization
    from config import config
    engine = init_db(config.DATABASE_URL)
    session = get_session(engine)
    seed_categories(session)

    # Print created categories
    categories = session.query(Category).all()
    for cat in categories:
        print(f"\n{cat.name} ({cat.code}):")
        for sub in cat.subcategories:
            print(f"  - {sub.name} ({sub.code})")
