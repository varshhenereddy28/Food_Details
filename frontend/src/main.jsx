import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createWorker } from 'tesseract.js';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function App() {
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('');
  const [image, setImage] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [form, setForm] = useState({ name: '', category: 'produce', quantity: 1, unit: 'item', expDate: '', mfgDate: '' });

  function registeredPhone() {
    return `${countryCode}${mobileNumber}`;
  }

  async function requestOtp() {
    if (!/^\d{10}$/.test(mobileNumber)) return setStatus('Enter exactly 10 mobile digits.');
    const response = await fetch(`${API}/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: registeredPhone() }) });
    const data = await response.json();
    if (response.ok) {
      setOtp(data.developmentOtp || '');
      setStatus(`OTP generated${data.developmentOtp ? `: ${data.developmentOtp}` : ''}`);
    } else setStatus(data.error || 'Could not generate OTP');
  }

  async function verifyOtp() {
    if (!/^\d{10}$/.test(mobileNumber)) return setStatus('Enter exactly 10 mobile digits.');
    const response = await fetch(`${API}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: registeredPhone(), otp }) });
    const data = await response.json();
    if (data.accessToken) { setToken(data.accessToken); setStatus('Signed in'); loadProducts(data.accessToken); }
    else setStatus(data.error || 'Could not sign in');
  }

  async function loadProducts(currentToken = token) {
    const response = await fetch(`${API}/products`, { headers: { Authorization: `Bearer ${currentToken}` } });
    setProducts(await response.json());
  }

  async function scanImage() {
    if (!image) return setStatus('Choose a product image first');
    const body = new FormData();
    const worker = await createWorker('eng');
    const ocr = await worker.recognize(image);
    await worker.terminate();
    body.append('image', image);
    body.append('ocrText', ocr.data.text);
    const response = await fetch(`${API}/ocr/parse`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    const data = await response.json();
    if (response.ok) {
      setOcrResult(data);
      setForm(current => ({ ...current, mfgDate: data.manufacturing || '', expDate: data.expiry || '' }));
      setStatus(data.expiry || data.manufacturing ? 'Dates found. Confirm them before saving.' : 'No dates found. Enter them manually.');
    } else setStatus(data.error || 'Could not scan image');
  }

  async function startCamera() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      videoRef.current.srcObject = streamRef.current;
      setCameraOn(true);
    } catch { setStatus('Camera permission was denied or is unavailable.'); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function takePhoto() {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => { if (blob) { setImage(new File([blob], 'product-camera.jpg', { type: 'image/jpeg' })); setOcrResult(null); setStatus('Photo captured. Scan it to read dates.'); } stopCamera(); }, 'image/jpeg', 0.85);
  }

  async function addProduct(event) {
    event.preventDefault();
    const response = await fetch(`${API}/products`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, source: 'manual', mfgDate: form.mfgDate || null }) });
    if (response.ok) { setForm({ ...form, name: '', expDate: '', mfgDate: '' }); loadProducts(); }
    else setStatus((await response.json()).error || 'Validation failed');
  }

  return <main>
    <header><span className="kicker">PANTRY / CONTROL</span><h1>Freshness, at a glance.</h1><p>Keep expiry dates visible, confirmed, and gently on time.</p></header>
    {!token ? <section className="login"><h2>Phone sign in</h2><div className="phoneFields"><select aria-label="Country code" value={countryCode} onChange={event => setCountryCode(event.target.value)}><option value="+91">India +91</option><option value="+1">US/Canada +1</option><option value="+44">UK +44</option><option value="+61">Australia +61</option><option value="+971">UAE +971</option></select><input aria-label="10-digit mobile number" inputMode="numeric" maxLength="10" pattern="[0-9]{10}" placeholder="10-digit mobile number" value={mobileNumber} onChange={event => setMobileNumber(event.target.value.replace(/\D/g, '').slice(0, 10))} /></div><button onClick={requestOtp}>Generate OTP</button><input placeholder="6-digit OTP" inputMode="numeric" maxLength="6" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button onClick={verifyOtp}>Verify & enter</button><small>{status}</small></section> : <section className="workspace">
      <form onSubmit={addProduct}><h2>Add food</h2><input required placeholder="Product name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /><label>Label image<input type="file" accept="image/*" capture="environment" onChange={event => { setImage(event.target.files?.[0] || null); setOcrResult(null); }} /></label><button type="button" onClick={startCamera}>Open camera</button>{cameraOn && <div className="camera"><video ref={videoRef} autoPlay playsInline /><button type="button" onClick={takePhoto}>Take photo</button><button type="button" onClick={stopCamera}>Close camera</button></div>}<button type="button" onClick={scanImage}>Scan dates from image</button>{ocrResult && <small>{ocrResult.expiry ? `Expiry candidate: ${ocrResult.expiry}` : 'No expiry candidate found'} {ocrResult.confidence ? `(${Math.round(ocrResult.confidence * 100)}% confidence)` : ''}</small>}<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option>produce</option><option>dairy</option><option>packaged</option><option>meat</option></select><input type="number" min="1" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /><input placeholder="Unit" value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} /><label>Made on<input type="date" value={form.mfgDate} onChange={event => setForm({ ...form, mfgDate: event.target.value })} /></label><label>Expires on<input required type="date" value={form.expDate} onChange={event => setForm({ ...form, expDate: event.target.value })} /></label><button>Add to pantry</button><small>{status}</small></form>
      <div className="list"><div className="listHead"><h2>Your pantry</h2><button onClick={() => loadProducts()}>Refresh</button></div>{products.map(product => <article key={product.id}><div><strong>{product.name}</strong><span>{product.quantity} {product.unit} · {product.category}</span></div><time>{product.exp_date}</time></article>)}{!products.length && <p className="empty">Your pantry is waiting for its first date.</p>}</div>
    </section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
