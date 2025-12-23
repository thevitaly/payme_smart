"""
Dropbox upload service with OAuth2 refresh token support
"""
import os
import logging
from datetime import datetime
from typing import Optional
import httpx
from config import config

logger = logging.getLogger(__name__)

# Cache for access token
_access_token = None
_token_expires_at = None


async def get_access_token() -> Optional[str]:
    """Get valid access token, refreshing if needed"""
    global _access_token, _token_expires_at

    # Check if we have a valid cached token
    if _access_token and _token_expires_at:
        if datetime.now().timestamp() < _token_expires_at - 300:  # 5 min buffer
            return _access_token

    # If we have a direct access token (legacy), use it
    if config.DROPBOX_ACCESS_TOKEN and not config.DROPBOX_REFRESH_TOKEN:
        return config.DROPBOX_ACCESS_TOKEN

    # Refresh token using refresh_token
    if not config.DROPBOX_REFRESH_TOKEN:
        logger.warning("Dropbox: No refresh token configured")
        return None

    if not config.DROPBOX_APP_KEY or not config.DROPBOX_APP_SECRET:
        logger.warning("Dropbox: App key/secret not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.dropboxapi.com/oauth2/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": config.DROPBOX_REFRESH_TOKEN,
                    "client_id": config.DROPBOX_APP_KEY,
                    "client_secret": config.DROPBOX_APP_SECRET,
                }
            )

            if response.status_code == 200:
                data = response.json()
                _access_token = data.get("access_token")
                expires_in = data.get("expires_in", 14400)  # Default 4 hours
                _token_expires_at = datetime.now().timestamp() + expires_in
                logger.info("Dropbox: Token refreshed successfully")
                return _access_token
            else:
                logger.error(f"Dropbox token refresh error: {response.status_code} - {response.text}")
                return None

    except Exception as e:
        logger.error(f"Dropbox token refresh error: {e}")
        return None


async def upload_to_dropbox(
    local_path: str,
    category_code: str = "UNCATEGORIZED",
    subcategory_code: str = "",
    expense_id: int = 0
) -> Optional[str]:
    """
    Upload file to Dropbox and return shared link

    Args:
        local_path: Path to local file
        category_code: Category code for folder organization
        subcategory_code: Subcategory code
        expense_id: Expense ID for unique naming

    Returns:
        Shared link URL or None if failed
    """
    access_token = await get_access_token()

    if not access_token:
        logger.error("Dropbox: No valid access token")
        return None

    if not os.path.exists(local_path):
        logger.error(f"Dropbox: File not found: {local_path}")
        return None

    logger.info(f"Dropbox: Uploading {local_path} for expense {expense_id}")

    try:
        # Generate Dropbox path
        date_folder = datetime.now().strftime("%Y/%m")
        filename = os.path.basename(local_path)
        ext = os.path.splitext(filename)[1]

        # Create unique filename
        dropbox_filename = f"{expense_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
        dropbox_path = f"/PayMe/{category_code}/{date_folder}/{dropbox_filename}"

        # Read file
        with open(local_path, "rb") as f:
            file_data = f.read()

        async with httpx.AsyncClient(timeout=120.0) as client:
            # Upload file
            upload_response = await client.post(
                "https://content.dropboxapi.com/2/files/upload",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Dropbox-API-Arg": f'{{"path": "{dropbox_path}", "mode": "add", "autorename": true}}',
                    "Content-Type": "application/octet-stream"
                },
                content=file_data
            )

            if upload_response.status_code != 200:
                logger.error(f"Dropbox upload error: {upload_response.status_code} - {upload_response.text}")
                return None

            upload_result = upload_response.json()
            uploaded_path = upload_result.get("path_display", dropbox_path)

            # Create shared link
            link_response = await client.post(
                "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "path": uploaded_path,
                    "settings": {
                        "requested_visibility": "public"
                    }
                }
            )

            if link_response.status_code == 200:
                link_result = link_response.json()
                url = link_result.get("url")
                logger.info(f"Dropbox: Upload success, URL: {url}")
                return url
            elif link_response.status_code == 409:
                # Link already exists, get existing link
                existing_response = await client.post(
                    "https://api.dropboxapi.com/2/sharing/list_shared_links",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "path": uploaded_path,
                        "direct_only": True
                    }
                )
                if existing_response.status_code == 200:
                    links = existing_response.json().get("links", [])
                    if links:
                        url = links[0].get("url")
                        logger.info(f"Dropbox: Got existing link: {url}")
                        return url

            logger.error(f"Dropbox link error: {link_response.status_code} - {link_response.text}")
            return None

    except Exception as e:
        logger.error(f"Dropbox upload error: {e}")
        return None
