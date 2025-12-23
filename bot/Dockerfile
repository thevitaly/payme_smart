FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Create directories for uploads
RUN mkdir -p /app/uploads /app/data

# Run the bot
CMD ["python", "src/bot.py"]
