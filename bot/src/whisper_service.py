"""
Whisper transcription service using OpenAI API
"""
import os
import tempfile
from pathlib import Path
from typing import Optional
import httpx
from config import config


async def transcribe_audio(audio_path: str) -> Optional[str]:
    """
    Transcribe audio file using OpenAI Whisper API

    Args:
        audio_path: Path to the audio file (ogg, mp3, wav, etc.)

    Returns:
        Transcribed text or None if failed
    """
    if not config.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set")

    api_url = "https://api.openai.com/v1/audio/transcriptions"

    headers = {
        "Authorization": f"Bearer {config.OPENAI_API_KEY}",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(audio_path, "rb") as audio_file:
                files = {
                    "file": (Path(audio_path).name, audio_file, "audio/ogg"),
                }
                data = {
                    "model": "whisper-1",
                    "language": "ru",  # Russian
                    "response_format": "text",
                }

                response = await client.post(
                    api_url,
                    headers=headers,
                    files=files,
                    data=data,
                )

                if response.status_code == 200:
                    return response.text.strip()
                else:
                    print(f"Whisper API error: {response.status_code} - {response.text}")
                    return None

    except Exception as e:
        print(f"Transcription error: {e}")
        return None


async def transcribe_telegram_voice(bot, voice_file_id: str) -> tuple[Optional[str], Optional[str]]:
    """
    Download and transcribe Telegram voice message

    Args:
        bot: Telegram bot instance
        voice_file_id: Telegram file ID

    Returns:
        Tuple of (transcription, local_file_path)
    """
    try:
        # Get file info from Telegram
        file = await bot.get_file(voice_file_id)

        # Create temp file for download
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        temp_path = os.path.join(config.UPLOAD_DIR, f"voice_{voice_file_id}.ogg")

        # Download file
        await file.download_to_drive(temp_path)

        # Transcribe
        transcription = await transcribe_audio(temp_path)

        return transcription, temp_path

    except Exception as e:
        print(f"Voice transcription error: {e}")
        return None, None
