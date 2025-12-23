"""
Main Telegram Bot for Expense Tracking
"""
import os
import logging
from datetime import datetime
from telegram import Update, BotCommand, MenuButtonCommands
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

from config import config, CallbackPrefix, Messages
import secrets
import string
from database import (
    init_db, get_session, seed_categories,
    User, Category, Subcategory, Expense, PendingAction, InviteCode,
    InputType, ExpenseStatus, PaymentType
)


def generate_invite_code(length=8):
    """Generate random invite code"""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

from keyboards import (
    get_transcription_confirmation_keyboard,
    get_categories_keyboard,
    get_payment_type_keyboard,
    get_subcategories_keyboard,
    get_amount_confirmation_keyboard,
    get_voice_with_amount_keyboard,
)
from whisper_service import transcribe_telegram_voice
from amount_extractor import extract_expense_info, extract_from_image, extract_from_pdf, extract_multiple_expenses
from dropbox_service import upload_to_dropbox

# Setup logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Database
engine = None
Session = None


def get_db():
    """Get database session"""
    global engine, Session
    if engine is None:
        engine = init_db(config.DATABASE_URL)
        from sqlalchemy.orm import sessionmaker
        Session = sessionmaker(bind=engine)
        # Seed categories
        session = Session()
        seed_categories(session)
        session.close()
    return Session()


def is_authorized(telegram_id: int, session) -> bool:
    """Check if user is authorized"""
    # Check if in allowed list (if configured)
    if config.allowed_user_ids_list:
        if telegram_id not in config.allowed_user_ids_list:
            return False

    # Check if admin
    if telegram_id in config.admin_ids_list:
        return True

    # Check in database
    user = session.query(User).filter_by(telegram_id=telegram_id, is_active=True).first()
    return user is not None


def get_or_create_user(telegram_id: int, username: str, first_name: str, last_name: str, session) -> User:
    """Get existing user or create new one"""
    user = session.query(User).filter_by(telegram_id=telegram_id).first()

    if not user:
        user = User(
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
            last_name=last_name,
            is_admin=telegram_id in config.admin_ids_list
        )
        session.add(user)
        session.commit()

    return user


# Command handlers
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    session = get_db()
    try:
        user = update.effective_user

        if not is_authorized(user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        get_or_create_user(
            user.id,
            user.username,
            user.first_name,
            user.last_name,
            session
        )

        await update.message.reply_text(Messages.WELCOME)
    finally:
        session.close()


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command"""
    session = get_db()
    try:
        if not is_authorized(update.effective_user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        await update.message.reply_text(Messages.HELP)
    finally:
        session.close()


# Admin commands
async def adduser_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /adduser command (admin only)"""
    session = get_db()
    try:
        if update.effective_user.id not in config.admin_ids_list:
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        if not context.args or len(context.args) < 1:
            await update.message.reply_text("Использование: /adduser <telegram_id>")
            return

        try:
            new_user_id = int(context.args[0])
        except ValueError:
            await update.message.reply_text("Неверный ID пользователя")
            return

        # Check if user exists
        user = session.query(User).filter_by(telegram_id=new_user_id).first()

        if user:
            user.is_active = True
        else:
            user = User(telegram_id=new_user_id, is_active=True)
            session.add(user)

        session.commit()
        await update.message.reply_text(Messages.USER_ADDED.format(user=new_user_id))
    finally:
        session.close()


async def removeuser_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /removeuser command (admin only)"""
    session = get_db()
    try:
        if update.effective_user.id not in config.admin_ids_list:
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        if not context.args or len(context.args) < 1:
            await update.message.reply_text("Использование: /removeuser <telegram_id>")
            return

        try:
            user_id = int(context.args[0])
        except ValueError:
            await update.message.reply_text("Неверный ID пользователя")
            return

        user = session.query(User).filter_by(telegram_id=user_id).first()

        if user:
            user.is_active = False
            session.commit()
            await update.message.reply_text(Messages.USER_REMOVED.format(user=user_id))
        else:
            await update.message.reply_text("Пользователь не найден")
    finally:
        session.close()


async def users_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /users command (admin only)"""
    session = get_db()
    try:
        if update.effective_user.id not in config.admin_ids_list:
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        users = session.query(User).filter_by(is_active=True).all()

        if not users:
            await update.message.reply_text("Список пользователей пуст")
            return

        user_list = "\n".join([
            f"- {u.telegram_id} (@{u.username or 'no_username'})"
            for u in users
        ])
        await update.message.reply_text(Messages.USER_LIST.format(users=user_list))
    finally:
        session.close()


async def invite_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /invite command (admin only) - generate invite code"""
    session = get_db()
    try:
        if update.effective_user.id not in config.admin_ids_list:
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        # Generate unique code
        code = generate_invite_code()
        while session.query(InviteCode).filter_by(code=code).first():
            code = generate_invite_code()

        # Save to database
        invite = InviteCode(
            code=code,
            created_by=update.effective_user.id
        )
        session.add(invite)
        session.commit()

        # Get bot username for link
        bot_info = await context.bot.get_me()
        bot_username = bot_info.username

        await update.message.reply_text(
            f"💰 *PayMe Expense Bot*\n\n"
            f"➡️ https://t.me/{bot_username}\n\n"
            f"Для доступа: `/auth {code}`",
            parse_mode='Markdown'
        )
    finally:
        session.close()


async def auth_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /auth command - authorize with invite code"""
    session = get_db()
    try:
        user = update.effective_user

        # Check if already authorized
        existing_user = session.query(User).filter_by(telegram_id=user.id, is_active=True).first()
        if existing_user or user.id in config.admin_ids_list:
            await update.message.reply_text("Вы уже авторизованы!")
            return

        # Check code
        if not context.args or len(context.args) < 1:
            await update.message.reply_text(
                "Для авторизации введите код:\n/auth <код>\n\n"
                "Получите код у администратора."
            )
            return

        code = context.args[0].upper()

        # Find invite code
        invite = session.query(InviteCode).filter_by(code=code, is_used=False).first()

        if not invite:
            await update.message.reply_text("Неверный или использованный код.")
            return

        # Mark code as used
        invite.is_used = True
        invite.used_by = user.id
        invite.used_at = datetime.utcnow()

        # Create user
        new_user = User(
            telegram_id=user.id,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            is_active=True,
            is_admin=False
        )
        session.add(new_user)
        session.commit()

        await update.message.reply_text(
            f"Добро пожаловать, {user.first_name}!\n\n"
            f"Вы успешно авторизованы. Теперь можете отправлять расходы."
        )
    finally:
        session.close()


# Message handlers
async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text messages - supports multiple expenses in one message"""
    session = get_db()
    try:
        user = update.effective_user

        if not is_authorized(user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        db_user = get_or_create_user(
            user.id, user.username, user.first_name, user.last_name, session
        )

        text = update.message.text

        # Extract MULTIPLE expenses from text
        expenses_data = await extract_multiple_expenses(text)

        # If no expenses found, fallback to single extraction
        if not expenses_data:
            amount, currency, description = await extract_expense_info(text)
            if amount or description:
                expenses_data = [{
                    "amount": amount,
                    "currency": currency or "EUR",
                    "description": description,
                    "payment_method": None
                }]

        # If still nothing, create empty expense
        if not expenses_data:
            expenses_data = [{
                "amount": None,
                "currency": "EUR",
                "description": None,
                "payment_method": None
            }]

        categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()

        # Create expense records and send messages for each
        for exp_data in expenses_data:
            expense = Expense(
                user_id=db_user.id,
                input_type=InputType.TEXT,
                original_text=text,
                amount=exp_data.get("amount"),
                currency=exp_data.get("currency", "EUR"),
                description=exp_data.get("description"),
                status=ExpenseStatus.PENDING
            )
            session.add(expense)
            session.commit()

            # Build message
            desc_line = f"📝 *{exp_data.get('description')}*\n" if exp_data.get('description') else ""
            amount_line = f"💰 *{exp_data.get('amount')} {exp_data.get('currency', 'EUR')}*\n" if exp_data.get('amount') else ""

            await update.message.reply_text(
                f"{desc_line}{amount_line}\n" + Messages.SELECT_CATEGORY,
                parse_mode='Markdown',
                reply_markup=get_categories_keyboard(categories, expense.id)
            )
    finally:
        session.close()


def _format_payment_method(method: str) -> str:
    """Format payment method for display"""
    if not method:
        return ""
    methods = {
        "cash": "кэш",
        "card": "карта",
        "transfer": "перевод"
    }
    return methods.get(method.lower(), method)


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle photo messages - payment_type=BANK by default"""
    session = get_db()
    try:
        user = update.effective_user

        if not is_authorized(user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        db_user = get_or_create_user(
            user.id, user.username, user.first_name, user.last_name, session
        )

        status_msg = await update.message.reply_text("⏳ Обрабатываю фото")

        # Get the largest photo
        photo = update.message.photo[-1]

        # Save file
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        file = await context.bot.get_file(photo.file_id)
        file_path = os.path.join(config.UPLOAD_DIR, f"photo_{photo.file_id}.jpg")
        await file.download_to_drive(file_path)

        # Extract amount and description from image
        amount, currency, description = await extract_from_image(file_path)

        # Create expense record with payment_type=BANK
        expense = Expense(
            user_id=db_user.id,
            input_type=InputType.PHOTO,
            file_id=photo.file_id,
            file_path=file_path,
            amount=amount,
            currency=currency or 'EUR',
            payment_type=PaymentType.BANK,
            status=ExpenseStatus.PENDING
        )
        session.add(expense)
        session.commit()

        # Delete status message
        await status_msg.delete()

        # Show amount confirmation
        if amount:
            desc_line = f"📝 *{description}*\n" if description else ""
            await update.message.reply_text(
                f"{desc_line}"
                f"💰 Сумма: *{amount} {currency}*\n"
                f"💳 Оплата: *Bank*\n\n"
                f"Всё верно?",
                parse_mode='Markdown',
                reply_markup=get_amount_confirmation_keyboard(expense.id, amount, currency)
            )
        else:
            # No amount found, go to categories
            desc_line = f"📝 {description}\n\n" if description else ""
            categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()
            await update.message.reply_text(
                f"{desc_line}Сумма не найдена\n💳 Оплата: *Bank*\n\n" + Messages.SELECT_CATEGORY,
                parse_mode='Markdown',
                reply_markup=get_categories_keyboard(categories, expense.id)
            )
    finally:
        session.close()


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle document messages (PDF, etc.) - payment_type=BANK by default"""
    session = get_db()
    status_msg = None
    try:
        user = update.effective_user
        logger.info(f"[Document] Received from user {user.id}")

        if not is_authorized(user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        db_user = get_or_create_user(
            user.id, user.username, user.first_name, user.last_name, session
        )

        status_msg = await update.message.reply_text("⏳ Обрабатываю документ")

        document = update.message.document
        logger.info(f"[Document] file_name={document.file_name}, mime_type={document.mime_type}")

        # Save file
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        file = await context.bot.get_file(document.file_id)
        file_path = os.path.join(config.UPLOAD_DIR, f"doc_{document.file_id}_{document.file_name}")
        await file.download_to_drive(file_path)
        logger.info(f"[Document] Saved to {file_path}")

        # Try to extract amount and description based on file type
        amount, currency, description = None, None, None
        try:
            if document.mime_type and document.mime_type.startswith('image/'):
                logger.info("[Document] Extracting from image...")
                amount, currency, description = await extract_from_image(file_path)
            elif document.mime_type == 'application/pdf' or file_path.lower().endswith('.pdf'):
                logger.info("[Document] Extracting from PDF...")
                amount, currency, description = await extract_from_pdf(file_path)
            logger.info(f"[Document] Extracted: amount={amount}, currency={currency}, desc={description}")
        except Exception as e:
            logger.error(f"[Document] Extraction error: {e}")

        # Create expense record with payment_type=BANK
        expense = Expense(
            user_id=db_user.id,
            input_type=InputType.DOCUMENT,
            file_id=document.file_id,
            file_path=file_path,
            file_name=document.file_name,
            amount=amount,
            currency=currency or 'EUR',
            payment_type=PaymentType.BANK,
            status=ExpenseStatus.PENDING
        )
        session.add(expense)
        session.commit()
        logger.info(f"[Document] Expense saved with id={expense.id}")

        await status_msg.delete()
        status_msg = None

        # Escape markdown special characters
        def escape_md(text):
            if not text:
                return text
            for char in ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']:
                text = str(text).replace(char, '\\' + char)
            return text

        safe_filename = escape_md(document.file_name)
        safe_desc = escape_md(description)

        # Show result
        if amount:
            desc_line = f"📝 {safe_desc}\n" if safe_desc else ""
            await update.message.reply_text(
                f"📄 {safe_filename}\n"
                f"{desc_line}"
                f"💰 Сумма: *{amount} {currency}*\n"
                f"💳 Оплата: *Bank*\n\n"
                f"Всё верно?",
                parse_mode='Markdown',
                reply_markup=get_amount_confirmation_keyboard(expense.id, amount, currency)
            )
        else:
            desc_line = f"📝 {safe_desc}\n\n" if safe_desc else ""
            categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()
            await update.message.reply_text(
                f"📄 {safe_filename}\n{desc_line}💳 Оплата: *Bank*\n\n" + Messages.SELECT_CATEGORY,
                parse_mode='Markdown',
                reply_markup=get_categories_keyboard(categories, expense.id)
            )
        logger.info("[Document] Response sent successfully")

    except Exception as e:
        logger.error(f"[Document] Error: {e}", exc_info=True)
        if status_msg:
            try:
                await status_msg.delete()
            except:
                pass
        await update.message.reply_text(f"❌ Ошибка обработки документа: {e}")
    finally:
        session.close()


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle voice messages - supports multiple expenses in one message"""
    session = get_db()
    try:
        user = update.effective_user

        if not is_authorized(user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        db_user = get_or_create_user(
            user.id, user.username, user.first_name, user.last_name, session
        )

        status_msg = await update.message.reply_text("⏳ Распознаю голосовое")

        voice = update.message.voice

        # Transcribe voice
        transcription, file_path = await transcribe_telegram_voice(context.bot, voice.file_id)

        if not transcription:
            await status_msg.delete()
            await update.message.reply_text(
                "Не удалось распознать голосовое сообщение. Попробуйте ещё раз."
            )
            return

        await status_msg.edit_text("⏳ Анализирую расходы")

        # Extract MULTIPLE expenses from transcription
        expenses_data = await extract_multiple_expenses(transcription)

        # If no expenses found, fallback to single extraction
        if not expenses_data:
            amount, currency, description = await extract_expense_info(transcription)
            if amount or description:
                expenses_data = [{
                    "amount": amount,
                    "currency": currency or "EUR",
                    "description": description,
                    "payment_method": None
                }]

        await status_msg.delete()

        # If still nothing found
        if not expenses_data:
            expense = Expense(
                user_id=db_user.id,
                input_type=InputType.VOICE,
                file_id=voice.file_id,
                file_path=file_path,
                transcription=transcription,
                status=ExpenseStatus.PENDING
            )
            session.add(expense)
            session.commit()

            await update.message.reply_text(
                f"🎤 _{transcription}_\n\n"
                f"Сумма не найдена\n\n"
                f"Всё верно?",
                parse_mode='Markdown',
                reply_markup=get_transcription_confirmation_keyboard(expense.id)
            )
            return

        categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()

        # Show transcription first
        await update.message.reply_text(
            f"🎤 _{transcription}_",
            parse_mode='Markdown'
        )

        # Create expense records and send messages for each
        for exp_data in expenses_data:
            expense = Expense(
                user_id=db_user.id,
                input_type=InputType.VOICE,
                file_id=voice.file_id,
                file_path=file_path,
                transcription=transcription,
                amount=exp_data.get("amount"),
                currency=exp_data.get("currency", "EUR"),
                description=exp_data.get("description"),
                status=ExpenseStatus.PENDING
            )
            session.add(expense)
            session.commit()

            # Build message
            desc_line = f"📝 *{exp_data.get('description')}*\n" if exp_data.get('description') else ""
            amount_line = f"💰 *{exp_data.get('amount')} {exp_data.get('currency', 'EUR')}*\n" if exp_data.get('amount') else ""

            await update.message.reply_text(
                f"{desc_line}{amount_line}\n" + Messages.SELECT_CATEGORY,
                parse_mode='Markdown',
                reply_markup=get_categories_keyboard(categories, expense.id)
            )
    finally:
        session.close()


async def _save_expense(query, session, expense):
    """Save expense and show confirmation"""
    expense.status = ExpenseStatus.CONFIRMED
    expense.confirmed_at = datetime.utcnow()

    # Get category info for Dropbox folder
    category = session.query(Category).filter_by(id=expense.category_id).first()
    subcategory = session.query(Subcategory).filter_by(id=expense.subcategory_id).first()

    # Upload to Dropbox if there's a file
    dropbox_url = None
    logger.info(f"[Dropbox] expense_id={expense.id}, file_path={expense.file_path}")

    if expense.file_path:
        file_exists = os.path.exists(expense.file_path)
        logger.info(f"[Dropbox] file_exists={file_exists}")

        if file_exists:
            dropbox_url = await upload_to_dropbox(
                expense.file_path,
                category.code if category else "UNCATEGORIZED",
                subcategory.code if subcategory else "",
                expense.id
            )
            logger.info(f"[Dropbox] upload result: {dropbox_url}")

            if dropbox_url:
                expense.dropbox_url = dropbox_url
            else:
                logger.warning(f"[Dropbox] upload_to_dropbox returned None for expense {expense.id}")
        else:
            logger.warning(f"[Dropbox] File not found: {expense.file_path}")
    else:
        logger.info(f"[Dropbox] No file_path for expense {expense.id} (input_type={expense.input_type})")

    session.commit()

    payment_type_names = {
        PaymentType.CASH: "💵 Cash",
        PaymentType.BANK: "🏦 Bank",
    }

    # Build confirmation message
    amount_str = f"\n💰 *{expense.amount} {expense.currency}*" if expense.amount else ""
    payment_str = f"\n💳 {payment_type_names.get(expense.payment_type, '—')}" if expense.payment_type else ""
    dropbox_str = f"\n📎 [Dropbox]({dropbox_url})" if dropbox_url else ""

    await query.edit_message_text(
        f"✅ *Сохранено*\n"
        f"\n📂 {category.name if category else '—'} → {subcategory.name if subcategory else '—'}"
        f"{amount_str}"
        f"{payment_str}"
        f"{dropbox_str}",
        parse_mode='Markdown',
        disable_web_page_preview=True
    )


# Callback handlers
async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline button callbacks"""
    query = update.callback_query
    await query.answer()

    data = query.data
    session = get_db()

    try:
        if not is_authorized(update.effective_user.id, session):
            await query.edit_message_text(Messages.NOT_AUTHORIZED)
            return

        # Parse callback data
        parts = data.split(":")

        if data.startswith(CallbackPrefix.CONFIRM_TRANSCRIPTION):
            # Confirm transcription, show categories
            expense_id = int(parts[1])
            categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()

            await query.edit_message_text(
                Messages.TRANSCRIPTION_CONFIRMED,
                reply_markup=get_categories_keyboard(categories, expense_id)
            )

        elif data.startswith(CallbackPrefix.RETRY_TRANSCRIPTION):
            # User wants to re-record
            expense_id = int(parts[1])

            # Cancel current expense
            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                expense.status = ExpenseStatus.CANCELLED
                session.commit()

            await query.edit_message_text(Messages.TRANSCRIPTION_RETRY)

        elif data.startswith(CallbackPrefix.CONFIRM_AMOUNT):
            # Amount confirmed, show categories
            expense_id = int(parts[1])

            # Check if "no amount" option
            if len(parts) > 2 and parts[2] == "no":
                expense = session.query(Expense).filter_by(id=expense_id).first()
                if expense:
                    expense.amount = None
                    session.commit()

            categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()
            await query.edit_message_text(
                Messages.SELECT_CATEGORY,
                reply_markup=get_categories_keyboard(categories, expense_id)
            )

        elif data.startswith(CallbackPrefix.EDIT_AMOUNT):
            # User wants to edit amount - for now just skip amount
            expense_id = int(parts[1])
            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                expense.amount = None
                session.commit()

            categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()
            await query.edit_message_text(
                "Сумма пропущена\n\n" + Messages.SELECT_CATEGORY,
                reply_markup=get_categories_keyboard(categories, expense_id)
            )

        elif data.startswith(CallbackPrefix.PAYMENT_CASH):
            # Set payment type to CASH and save
            expense_id = int(parts[1])
            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                try:
                    expense.payment_type = PaymentType.CASH
                    session.commit()
                    await _save_expense(query, session, expense)
                except Exception as e:
                    logger.error(f"Error saving expense (CASH): {e}")
                    await query.edit_message_text(f"Ошибка сохранения: {e}")
            else:
                await query.edit_message_text("Расход не найден")

        elif data.startswith(CallbackPrefix.PAYMENT_BANK):
            # Set payment type to BANK and save
            expense_id = int(parts[1])
            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                try:
                    expense.payment_type = PaymentType.BANK
                    session.commit()
                    await _save_expense(query, session, expense)
                except Exception as e:
                    logger.error(f"Error saving expense (BANK): {e}")
                    await query.edit_message_text(f"Ошибка сохранения: {e}")
            else:
                await query.edit_message_text("Расход не найден")

        elif data.startswith(CallbackPrefix.CATEGORY):
            # Category selected, show subcategories
            category_id = int(parts[1])
            expense_id = int(parts[2])

            # Update expense with category
            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                expense.category_id = category_id
                session.commit()

            # Get subcategories
            subcategories = session.query(Subcategory).filter_by(
                category_id=category_id, is_active=True
            ).order_by(Subcategory.order_num).all()

            await query.edit_message_text(
                Messages.SELECT_SUBCATEGORY,
                reply_markup=get_subcategories_keyboard(subcategories, category_id, expense_id)
            )

        elif data.startswith(CallbackPrefix.SUBCATEGORY):
            # Subcategory selected, show payment type selection
            subcategory_id = int(parts[1])
            expense_id = int(parts[2])

            # Update expense with subcategory
            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                expense.subcategory_id = subcategory_id
                session.commit()

                # For PHOTO/DOCUMENT - payment_type already set to BANK, save directly
                if expense.input_type in [InputType.PHOTO, InputType.DOCUMENT]:
                    await _save_expense(query, session, expense)
                else:
                    # For TEXT/VOICE - ask for payment type
                    subcategory = session.query(Subcategory).filter_by(id=subcategory_id).first()
                    await query.edit_message_text(
                        f"📝 *{expense.description or '—'}*\n"
                        f"💰 *{expense.amount} {expense.currency}*\n"
                        f"📂 {subcategory.name if subcategory else '—'}\n\n"
                        f"Выберите способ оплаты:",
                        parse_mode='Markdown',
                        reply_markup=get_payment_type_keyboard(expense_id)
                    )
            else:
                await query.edit_message_text(Messages.ERROR)

        elif data.startswith(CallbackPrefix.BACK_TO_SUBCATEGORY):
            # Go back to subcategory selection from payment type
            expense_id = int(parts[1])
            expense = session.query(Expense).filter_by(id=expense_id).first()

            if expense and expense.category_id:
                subcategories = session.query(Subcategory).filter_by(
                    category_id=expense.category_id, is_active=True
                ).order_by(Subcategory.order_num).all()

                await query.edit_message_text(
                    Messages.SELECT_SUBCATEGORY,
                    reply_markup=get_subcategories_keyboard(subcategories, expense.category_id, expense_id)
                )
            else:
                # Fallback to categories if no category selected
                categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()
                await query.edit_message_text(
                    Messages.SELECT_CATEGORY,
                    reply_markup=get_categories_keyboard(categories, expense_id)
                )

        elif data.startswith(CallbackPrefix.BACK):
            # Go back to categories
            expense_id = int(parts[1])
            categories = session.query(Category).filter_by(is_active=True).order_by(Category.order_num).all()

            await query.edit_message_text(
                Messages.SELECT_CATEGORY,
                reply_markup=get_categories_keyboard(categories, expense_id)
            )

        elif data.startswith(CallbackPrefix.CANCEL):
            # Cancel operation
            expense_id = int(parts[1])

            expense = session.query(Expense).filter_by(id=expense_id).first()
            if expense:
                expense.status = ExpenseStatus.CANCELLED
                session.commit()

            await query.edit_message_text(Messages.CANCELLED)

    finally:
        session.close()


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /stats command"""
    session = get_db()
    try:
        user = update.effective_user

        if not is_authorized(user.id, session):
            await update.message.reply_text(Messages.NOT_AUTHORIZED)
            return

        db_user = session.query(User).filter_by(telegram_id=user.id).first()

        if not db_user:
            await update.message.reply_text("У вас пока нет записей")
            return

        # Get stats
        total = session.query(Expense).filter_by(
            user_id=db_user.id,
            status=ExpenseStatus.CONFIRMED
        ).count()

        # By category
        categories = session.query(Category).all()
        stats_text = f"Всего расходов: {total}\n\nПо категориям:\n"

        for cat in categories:
            count = session.query(Expense).filter_by(
                user_id=db_user.id,
                category_id=cat.id,
                status=ExpenseStatus.CONFIRMED
            ).count()
            if count > 0:
                stats_text += f"- {cat.name}: {count}\n"

        await update.message.reply_text(stats_text)
    finally:
        session.close()


async def setup_bot_commands(application):
    """Set up bot menu commands"""
    commands = [
        BotCommand("start", "Начать работу"),
        BotCommand("auth", "Авторизация по коду"),
        BotCommand("help", "Помощь"),
        BotCommand("stats", "Статистика расходов"),
        BotCommand("invite", "Создать код (admin)"),
        BotCommand("users", "Список пользователей (admin)"),
    ]
    await application.bot.set_my_commands(commands)

    # Set menu button to show commands
    await application.bot.set_chat_menu_button(menu_button=MenuButtonCommands())

    logger.info("Bot commands menu set up successfully")


def main():
    """Start the bot"""
    if not config.TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set!")
        return

    # Initialize database
    get_db()

    # Create application
    application = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()

    # Set up commands menu on startup
    application.post_init = setup_bot_commands

    # Add handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("auth", auth_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("stats", stats_command))
    application.add_handler(CommandHandler("invite", invite_command))
    application.add_handler(CommandHandler("adduser", adduser_command))
    application.add_handler(CommandHandler("removeuser", removeuser_command))
    application.add_handler(CommandHandler("users", users_command))

    # Message handlers
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    application.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    application.add_handler(MessageHandler(filters.VOICE, handle_voice))

    # Callback handler
    application.add_handler(CallbackQueryHandler(handle_callback))

    # Start polling
    logger.info("Starting bot...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
