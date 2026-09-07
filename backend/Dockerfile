FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "python migrate.py && uvicorn app:app --host 0.0.0.0 --port 4000"]
