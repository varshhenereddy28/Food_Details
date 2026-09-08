import hashlib
import os
import secrets
import time
from datetime import date
from typing import Any

import jwt
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, field_validator
from redis import Redis

from date_parser import extract_dates

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://food:food@localhost:5434/food")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
JWT_SECRET = os.getenv("JWT_SECRET", "local-development-secret-change-me")
redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
app = FastAPI(title="Food Expiry API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
otps: dict[str, tuple[str, float]] = {}

class PhoneRequest(BaseModel):
    phone: str
    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str) -> str:
        if not __import__("re").fullmatch(r"\+[1-9]\d{7,14}", value):
            raise ValueError("Use E.164 phone format")
        return value

class VerifyRequest(PhoneRequest):
    email: EmailStr
    otp: str

class ProductRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=30)
    mfgDate: date | None = None
    expDate: date
    notes: str | None = Field(default=None, max_length=1000)
    source: str = "manual"
    imageUrl: str | None = None
    ocrConfidence: float | None = Field(default=None, ge=0, le=1)


def db_query(sql: str, params: tuple[Any, ...] = (), *, fetch: bool = False):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        result = connection.execute(sql, params)
        return result.fetchall() if fetch else result.rowcount


def token_for(user_id: str, phone: str) -> str:
    return jwt.encode({"sub": user_id, "phone": phone}, JWT_SECRET, algorithm="HS256")


def current_user(authorization: str | None = Header(default=None)) -> dict:
    try:
        token = (authorization or "").replace("Bearer ", "").strip()
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise HTTPException(401, "Unauthorized") from error

@app.get("/health")
def health():
    return {"ok": True, "smsConfigured": all(os.getenv(key) for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"))}

@app.post("/auth/request-otp")
def request_otp(payload: PhoneRequest):
    otp = f"{secrets.randbelow(900000) + 100000}"
    otps[payload.phone] = (hashlib.sha256(otp.encode()).hexdigest(), time.time() + 300)
    print(f"[local OTP] {payload.phone}: {otp}", flush=True)
    response = {"message": "OTP generated", "cooldownSeconds": 30}
    if os.getenv("NODE_ENV") != "production":
        response["developmentOtp"] = otp
    return response

@app.post("/auth/verify-otp")
def verify_otp(payload: VerifyRequest):
    record = otps.get(payload.phone)
    expected = hashlib.sha256(payload.otp.encode()).hexdigest()
    if not record or record[1] < time.time() or not secrets.compare_digest(record[0], expected):
        raise HTTPException(401, "Invalid or expired OTP")
    del otps[payload.phone]
    rows = db_query("INSERT INTO users(phone_number,email) VALUES(%s,%s) ON CONFLICT(phone_number) DO UPDATE SET email=EXCLUDED.email RETURNING id,phone_number,email", (payload.phone, str(payload.email).lower()), fetch=True)
    user = rows[0]
    return {"accessToken": token_for(str(user["id"]), user["phone_number"]), "user": {"id": str(user["id"]), "phone_number": user["phone_number"], "email": user["email"]}}

@app.get("/products")
def products(user: dict = Depends(current_user)):
    rows = db_query("SELECT * FROM products WHERE user_id=%s ORDER BY exp_date ASC", (user["sub"],), fetch=True)
    return [dict(row) for row in rows]

@app.post("/products", status_code=201)
def add_product(payload: ProductRequest, user: dict = Depends(current_user)):
    if payload.source not in {"manual", "ocr"} or payload.mfgDate and payload.expDate <= payload.mfgDate:
        raise HTTPException(400, "Invalid product dates or source")
    row = db_query("INSERT INTO products(user_id,name,category,quantity,unit,mfg_date,exp_date,notes,source,image_url,ocr_confidence) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *", (user["sub"], payload.name, payload.category, payload.quantity, payload.unit, payload.mfgDate, payload.expDate, payload.notes, payload.source, payload.imageUrl, payload.ocrConfidence), fetch=True)[0]
    return dict(row)

@app.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: str, user: dict = Depends(current_user)):
    db_query("DELETE FROM products WHERE id=%s AND user_id=%s", (product_id, user["sub"]))

@app.post("/ocr/parse")
async def parse_ocr(ocrText: str = Form(default=""), image: UploadFile | None = File(default=None), user: dict = Depends(current_user)):
    return {**extract_dates(ocrText), "imageAttached": image is not None, "requiresConfirmation": True}
