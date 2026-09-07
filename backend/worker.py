import json
import os
import time
from datetime import date

import psycopg
from dotenv import load_dotenv
from redis import Redis
from twilio.rest import Client

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://food:food@localhost:5434/food")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = Redis.from_url(REDIS_URL, decode_responses=True)


def sms_configured() -> bool:
    return all(os.getenv(key) for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"))


def scan_alerts():
    with psycopg.connect(DATABASE_URL) as connection:
        rows = connection.execute("SELECT p.id,p.name,p.exp_date,u.phone_number FROM products p JOIN users u ON u.id=p.user_id WHERE p.alerts_enabled AND p.exp_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 15").fetchall()
        for product_id, name, exp_date, phone in rows:
            days = (exp_date - date.today()).days
            alert_type = f"day_{days}"
            alert = connection.execute("SELECT a.id,a.status,n.provider_response->>'mode' AS mode FROM alerts a LEFT JOIN LATERAL (SELECT provider_response FROM notification_log WHERE alert_id=a.id ORDER BY created_at DESC LIMIT 1) n ON TRUE WHERE a.product_id=%s AND a.alert_type=%s", (product_id, alert_type)).fetchone()
            if not alert:
                alert_id = connection.execute("INSERT INTO alerts(product_id,alert_type,scheduled_for,channel) VALUES(%s,%s,CURRENT_DATE,'sms') RETURNING id", (product_id, alert_type)).fetchone()[0]
            elif alert[1] == "failed" or (alert[1] == "sent" and alert[2] == "development" and sms_configured()):
                connection.execute("UPDATE alerts SET status='pending',sent_at=NULL WHERE id=%s", (alert[0],))
                alert_id = alert[0]
            else:
                continue
            redis_client.rpush("food-alerts", json.dumps({"alertId": str(alert_id), "phone": phone, "product": name, "days": days}))


def deliver(job):
    message = f"Food expiry alert: {job['product']} expires today." if job["days"] == 0 else f"Food expiry alert: {job['product']} expires in {job['days']} days."
    try:
        if not sms_configured():
            if os.getenv("NODE_ENV") == "production":
                raise RuntimeError("Twilio credentials are required for SMS delivery")
            print(f"[local SMS] To {job['phone']}: {message}", flush=True)
            response = {"mode": "development", "channel": "sms", "to": job["phone"], "message": message}
        else:
            result = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]).messages.create(body=message, from_=os.environ["TWILIO_FROM_NUMBER"], to=job["phone"])
            response = {"sid": result.sid, "status": result.status, "channel": "sms", "to": job["phone"]}
        with psycopg.connect(DATABASE_URL) as connection:
            connection.execute("UPDATE alerts SET channel='sms',status='sent',sent_at=now() WHERE id=%s", (job["alertId"],))
            connection.execute("INSERT INTO notification_log(alert_id,provider_response) VALUES(%s,%s)", (job["alertId"], json.dumps(response)))
    except Exception as error:
        with psycopg.connect(DATABASE_URL) as connection:
            connection.execute("UPDATE alerts SET channel='sms',status='failed' WHERE id=%s", (job["alertId"],))
            connection.execute("INSERT INTO notification_log(alert_id,provider_response) VALUES(%s,%s)", (job["alertId"], json.dumps({"error": str(error), "channel": "sms", "to": job["phone"]})))
        raise


if __name__ == "__main__":
    while True:
        scan_alerts()
        deadline = time.time() + 86400
        while time.time() < deadline:
            item = redis_client.blpop("food-alerts", timeout=60)
            if item:
                deliver(json.loads(item[1]))
