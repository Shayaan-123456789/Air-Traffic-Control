FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ server/
COPY web/ web/
ENV CACHE_SECONDS=120 DAILY_CREDIT_BUDGET=160
EXPOSE 8000
CMD ["uvicorn","server.main:app","--host","0.0.0.0","--port","8000"]
