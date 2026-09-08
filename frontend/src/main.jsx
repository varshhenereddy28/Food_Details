import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createWorker } from 'tesseract.js';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function normalizeDateISO(value) {
  if (!value) return '';
  const dateValue = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dateValue.getTime())) return '';
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeShelfLifeDays(expDate) {
  if (!expDate) return null;
  const expiry = new Date(`${expDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function badgeClassForExpiry(expDate) {
  const days = computeShelfLifeDays(expDate);
  if (days === null) return 'badge-neutral';
  if (days > 7) return 'badge-fresh';
  if (days >= 0) return 'badge-warning';
  return 'badge-expired';
}

function renderBadge(expDate) {
  const days = computeShelfLifeDays(expDate);
  const badge = badgeClassForExpiry(expDate);
  if (days === null) return null;
  return <span className={`status-badge ${badge}`}>{days < 0 ? `${Math.abs(days)}d expired` : `${days}d left`}</span>;
}

function preprocessCaptureFrame(videoElement) {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) return null;

  const maxWidth = 1280;
  const ratio = Math.min(1, maxWidth / videoElement.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(videoElement.videoWidth * ratio));
  canvas.height = Math.max(1, Math.round(videoElement.videoHeight * ratio));
  const context = canvas.getContext('2d');

  context.filter = 'grayscale(1) contrast(1.2)';
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const brightness = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
    const value = brightness > 150 ? 255 : 0;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function preprocessImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(2, 1600 / image.width);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const variants = [-5, 0, 5].map(angle => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.filter = 'grayscale(1) contrast(1.35)';
        context.translate(width / 2, height / 2);
        context.rotate((angle * Math.PI) / 180);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        return canvas;
      });
      URL.revokeObjectURL(image.src);
      resolve(variants);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function App() {
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
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

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  function registeredPhone() {
    return `${countryCode}${mobileNumber}`;
  }

  async function requestOtp() {
    if (!/^\d{10}$/.test(mobileNumber)) return setStatus('Enter exactly 10 mobile digits.');
    try {
      const response = await fetch(`${API}/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: registeredPhone() }) });
      const data = await response.json();
      if (response.ok) {
        setOtp(data.developmentOtp || '');
        setStatus(`OTP generated${data.developmentOtp ? `: ${data.developmentOtp}` : ''}`);
      } else setStatus(data.error || 'Could not generate OTP');
    } catch { setStatus('Cannot reach the API. Start the backend on http://localhost:4000.'); }
  }

  async function verifyOtp() {
    if (!/^\d{10}$/.test(mobileNumber)) return setStatus('Enter exactly 10 mobile digits.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStatus('Enter a valid email address.');
    if (!/^\d{6}$/.test(otp)) return setStatus('Enter the 6-digit OTP.');
    try {
      const response = await fetch(`${API}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: registeredPhone(), email, otp }) });
      const data = await response.json();
      if (data.accessToken) { setToken(data.accessToken); setStatus('Signed in'); loadProducts(data.accessToken); }
      else setStatus(data.error || 'Could not sign in');
    } catch { setStatus('Cannot reach the API. Start the backend on http://localhost:4000.'); }
  }

  async function loadProducts(currentToken = token) {
    try {
      const response = await fetch(`${API}/products`, { headers: { Authorization: `Bearer ${currentToken}` } });
      setProducts(await response.json());
      const health = await fetch(`${API}/health`).then(result => result.json());
      if (!health.smsConfigured) setStatus('SMS is in local log mode. Add Twilio settings to .env and restart.');
    } catch { setStatus('Cannot reach the API. Start the backend on http://localhost:4000.'); }
  }

  function applyOcrResult(data) {
    setOcrResult(data);
    const manufacturing = normalizeDateISO(data?.manufacturing || '');
    const expiry = normalizeDateISO(data?.expiry || '');
    setForm(current => ({ ...current, mfgDate: manufacturing || current.mfgDate, expDate: expiry || current.expDate }));

    if ((data?.confidence || 0) < 0.6 || (!data?.expiry && !data?.manufacturing)) {
      setStatus("Dates couldn't be auto-read. Please verify below.");
      setTimeout(() => {
        const manualField = document.querySelectorAll('input[type="date"]')[1] || document.querySelector('input[type="date"]');
        if (manualField) manualField.focus();
      }, 0);
      return;
    }

    setStatus(data?.expiry || data?.manufacturing ? 'Dates found. Confirm them before saving.' : 'No dates found. Enter them manually.');
  }

  async function scanImageFromFile(file) {
    if (!file) return setStatus('Choose a product image first');
    try {
      const body = new FormData();
      const worker = await createWorker('eng');
      const processedImages = await preprocessImageFile(file);
      const ocrResults = await Promise.all([
        worker.recognize(file),
        ...processedImages.map(processedImage => worker.recognize(processedImage)),
      ]);
      await worker.terminate();
      const normalizedText = ocrResults.map(result => result.data.text)
        .filter(Boolean)
        .join('\n');
      body.append('image', file);
      body.append('ocrText', normalizedText);
      const response = await fetch(`${API}/ocr/parse`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
      const data = await response.json();
      if (response.ok) {
        applyOcrResult(data);
      } else {
        setStatus(data.error || 'Could not scan image');
      }
    } catch {
      setStatus('Could not scan the image. Check that the API is running.');
    }
  }

  async function scanImage() {
    if (!image) return setStatus('Choose a product image first');
    await scanImageFromFile(image);
  }

  async function startCamera() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setCameraOn(true);
    } catch { setStatus('Camera permission was denied or is unavailable.'); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function logout() {
    stopCamera();
    setToken('');
    setProducts([]);
    setOtp('');
    setStatus('Signed out');
  }

  async function takePhoto() {
    const processedCanvas = preprocessCaptureFrame(videoRef.current);
    if (!processedCanvas) return stopCamera();
    processedCanvas.toBlob(async (blob) => {
      if (blob) {
        const nextImage = new File([blob], 'product-camera.jpg', { type: 'image/jpeg' });
        setImage(nextImage);
        setOcrResult(null);
        setStatus('Photo captured. Reading dates...');
        stopCamera();
        await scanImageFromFile(nextImage);
        return;
      }
      stopCamera();
    }, 'image/jpeg', 0.9);
  }

  async function addProduct(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/products`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, source: 'manual', mfgDate: form.mfgDate || null }) });
      if (response.ok) { setForm({ ...form, name: '', expDate: '', mfgDate: '' }); loadProducts(); }
      else setStatus((await response.json()).error || 'Validation failed');
    } catch { setStatus('Cannot reach the API. Start the backend on http://localhost:4000.'); }
  }

  return <main>
    <header><span className="kicker">PANTRY / CONTROL</span><h1>Freshness, at a glance.</h1><p>Keep expiry dates visible, confirmed, and gently on time.</p></header>
    {!token ? <section className="login"><h2>Sign in</h2><input type="email" required placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} /><div className="phoneFields"><select aria-label="Country code" value={countryCode} onChange={event => setCountryCode(event.target.value)}><option value="+91">India +91</option><option value="+1">US/Canada +1</option><option value="+44">UK +44</option><option value="+61">Australia +61</option><option value="+971">UAE +971</option></select><input aria-label="10-digit mobile number" inputMode="numeric" maxLength="10" pattern="[0-9]{10}" placeholder="10-digit mobile number" value={mobileNumber} onChange={event => setMobileNumber(event.target.value.replace(/\D/g, '').slice(0, 10))} /></div><button onClick={requestOtp}>Generate OTP</button><input placeholder="6-digit OTP" inputMode="numeric" maxLength="6" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button onClick={verifyOtp}>Verify & enter</button><small>{status}</small></section> : <section className="workspace">
      <form onSubmit={addProduct}><h2>Add food</h2><input required placeholder="Product name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /><label>Label image<input type="file" accept="image/*" capture="environment" onChange={async event => {
              const nextImage = event.target.files?.[0] || null;
              setImage(nextImage);
              setOcrResult(null);
              if (nextImage) await scanImageFromFile(nextImage);
            }} /></label><button type="button" onClick={startCamera}>Open camera</button>{cameraOn && <div className="camera"><video ref={videoRef} autoPlay playsInline /><div className="ocr-guide-overlay" aria-hidden="true"><span className="ocr-guide-label">Align MFG / EXP Date Area Here</span></div><button className="capture-button" type="button" onClick={takePhoto}>Capture image</button><button type="button" onClick={stopCamera}>Close camera</button></div>}<button type="button" onClick={scanImage}>Scan dates from image</button>{ocrResult && <small>{ocrResult.expiry ? `Expiry candidate: ${ocrResult.expiry}` : 'No expiry candidate found'} {ocrResult.confidence ? `(${Math.round(ocrResult.confidence * 100)}% confidence)` : ''}</small>}<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option>produce</option><option>dairy</option><option>packaged</option><option>meat</option></select><input type="number" min="1" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /><input placeholder="Unit" value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} /><label>Made on<input type="date" value={form.mfgDate} onChange={event => setForm({ ...form, mfgDate: event.target.value })} /></label><label>Expires on<input required type="date" value={form.expDate} onChange={event => setForm({ ...form, expDate: event.target.value })} /></label><button>Add to pantry</button><small>{status}</small></form>
      <div className="list"><div className="listHead"><h2>Your pantry</h2><div><button onClick={() => loadProducts()}>Refresh</button><button type="button" onClick={logout}>Log out</button></div></div>{products.map(product => <article key={product.id}><div><strong>{product.name}</strong><span>{product.quantity} {product.unit} · {product.category}</span></div><div className="product-meta"><time>{product.exp_date}</time>{renderBadge(product.exp_date)}</div></article>)}{!products.length && <p className="empty">Your pantry is waiting for its first date.</p>}</div>
    </section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
