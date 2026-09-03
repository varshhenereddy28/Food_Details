import express from 'express';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { extractDates } from './dateParser.js';
import { query } from './db.js';

const app = express(); const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.use(cors()); app.use(express.json());
const otpLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, skip: () => process.env.NODE_ENV !== 'production' });
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use E.164 phone format');
const productSchema = z.object({ name:z.string().trim().min(1).max(120), category:z.string().trim().min(1).max(60), quantity:z.coerce.number().positive(), unit:z.string().trim().min(1).max(30), mfgDate:z.string().date().nullable().optional(), expDate:z.string().date(), notes:z.string().max(1000).optional(), source:z.enum(['manual','ocr']).default('manual'), imageUrl:z.string().url().optional(), ocrConfidence:z.number().min(0).max(1).optional() });
const secret = process.env.JWT_SECRET || 'local-development-secret-change-me';
const otps = new Map();
const tokenFor = user => jwt.sign({ sub:user.id, phone:user.phone_number }, secret, { expiresIn:'15m' });
function auth(req,res,next) { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ','').trim(), secret); next(); } catch { res.status(401).json({ error:'Unauthorized' }); } }
app.get('/health', (_,res) => res.json({ ok:true }));
app.post('/auth/request-otp', otpLimiter, async (req,res) => { const parsed = phoneSchema.safeParse(req.body.phone); if (!parsed.success) return res.status(400).json({error:parsed.error.issues[0].message}); const otp = String(crypto.randomInt(100000,1000000)); otps.set(parsed.data, { hash:crypto.createHash('sha256').update(otp).digest('hex'), expires:Date.now()+300000 }); console.log(`[local OTP] ${parsed.data}: ${otp}`); const response = { message:'OTP generated', cooldownSeconds:30 }; if (process.env.NODE_ENV !== 'production') response.developmentOtp = otp; res.json(response); });
app.post('/auth/verify-otp', async (req,res) => { const parsed = phoneSchema.safeParse(req.body.phone); if (!parsed.success) return res.status(400).json({error:parsed.error.issues[0].message}); const phone = parsed.data; const record = otps.get(phone); const hash = crypto.createHash('sha256').update(String(req.body.otp || '')).digest('hex'); if (!record || record.expires < Date.now() || record.hash !== hash) return res.status(401).json({error:'Invalid or expired OTP'}); otps.delete(phone); const result = await query('INSERT INTO users(phone_number) VALUES($1) ON CONFLICT(phone_number) DO UPDATE SET phone_number=EXCLUDED.phone_number RETURNING id, phone_number', [phone]); res.json({ accessToken:tokenFor(result.rows[0]), user:result.rows[0] }); });
app.get('/products', auth, async (req,res) => { const result = await query('SELECT * FROM products WHERE user_id=$1 ORDER BY exp_date ASC', [req.user.sub]); res.json(result.rows); });
app.post('/products', auth, async (req,res) => { const parsed = productSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({error:parsed.error.flatten()}); const p=parsed.data; if (p.mfgDate && p.expDate <= p.mfgDate) return res.status(400).json({error:'Expiry must be after manufacturing date'}); const result=await query('INSERT INTO products(user_id,name,category,quantity,unit,mfg_date,exp_date,notes,source,image_url,ocr_confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[req.user.sub,p.name,p.category,p.quantity,p.unit,p.mfgDate||null,p.expDate,p.notes||null,p.source,p.imageUrl||null,p.ocrConfidence||null]); res.status(201).json(result.rows[0]); });
app.delete('/products/:id', auth, async (req,res) => { await query('DELETE FROM products WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub]); res.status(204).end(); });
app.post('/ocr/parse', auth, upload.single('image'), (req,res) => { const parsed=extractDates(req.body.ocrText || ''); res.json({ ...parsed, imageAttached:Boolean(req.file), requiresConfirmation:true }); });
app.listen(process.env.PORT || 4000, () => console.log('Food expiry API listening on port 4000'));
export default app;
