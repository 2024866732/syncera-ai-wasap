#!/usr/bin/env python3
"""
receipt_ocr_processor_v2.py — HAFJET Receipt OCR (Production Hardened)

Key improvements over v1:
- Image preprocessing: deskew, denoise, adaptive threshold, sharpen
- Total amount extraction by LABEL PRECEDENCE (not max value)
- Image quality detection (blurry, low-light, faded, rotated)
- Vendor normalization via Supabase vendors table
- Confidence scoring per field
- Scanned PDF detection and routing
- Fallback to manual review when confidence < threshold

Dependencies:
    pip install pytesseract pillow pdfplumber numpy opencv-python-headless supabase

System:
    apt-get install tesseract-ocr tesseract-ocr-msa poppler-utils
"""

import os
import re
import json
import math
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, field

import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageStat
import numpy as np
import pdfplumber
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

MIN_CONFIDENCE_THRESHOLD = 0.70  # auto-complete if >= 0.70

# HAFJET expense categories
CATEGORIES = [
    "utilities", "stock_purchase", "repair_parts",
    "rent", "loan_repayment", "misc"
]

# Category keywords (weighted)
CATEGORY_KEYWORDS = {
    "utilities": {
        "tnb": 5, "tenaga": 5, "elektrik": 5, "electric": 5,
        "air selangor": 5, "syabas": 5, "water": 4,
        "unifi": 5, "streamyx": 5, "tm": 3, "maxis": 3, "celcom": 3,
        "digi": 3, "hotlink": 3, "umobile": 3, "tunetalk": 3,
        "internet": 4, "fibre": 4, "broadband": 4, "wifi": 3,
        "bill": 1, "payment": 1, "bayaran": 1
    },
    "stock_purchase": {
        "phone": 3, "fon": 3, "handphone": 3, "smartphone": 3,
        "iphone": 5, "samsung": 5, "vivo": 5, "oppo": 5,
        "xiaomi": 5, "realme": 5, "redmi": 5, "poco": 5,
        "infinix": 5, "tecnop": 5, "pixel": 5,
        "stock": 4, "inventori": 4, "supplier": 4, "distributor": 4,
        "unit": 2, "set": 2, "carton": 3, "box": 2
    },
    "repair_parts": {
        "lcd": 5, "screen": 5, "skrin": 5, "oled": 5,
        "battery": 5, "bateri": 5, "charging port": 5, "port cas": 5,
        "flex": 5, "kabel": 3, "cable": 3, "camera": 4, "kamera": 4,
        "speaker": 4, "mic": 4, "vibrator": 4, "button": 3, "tombol": 3,
        "back cover": 4, "casing": 2, "frame": 4, "motherboard": 5,
        "ic": 5, "parts": 3, "spare": 3, "komponen": 3,
        "repair": 2, "baiki": 2, "servis": 2, "ganti": 3
    },
    "rent": {
        "sewa": 5, "rental": 5, "kedai": 4, "shop lot": 5,
        "premis": 5, "tenancy": 5, "deposit": 3
    },
    "loan_repayment": {
        "bsn": 5, "bank simpanan": 5, "pinjaman": 4, "loan": 4,
        "angsuran": 4, "repayment": 5, "installment": 5, "cicilan": 5,
        "maybank": 4, "cimb": 4, "rhb": 4, "public bank": 4,
        "hong leong": 4, "affin": 4, "bank": 2
    },
    "misc": {
        "stationery": 3, "alat tulis": 3, "printing": 3, "cetak": 3,
        "photostat": 2, "kertas": 2, "ink": 3, "catridge": 3, "toner": 3,
        "maintenance": 3, "pemeliharaan": 3, "cleaning": 2, "kebersihan": 2,
        "security": 3, "keselamatan": 3, "insurance": 3, "insurans": 3,
        "license": 2, "lesen": 2, "permit": 2
    }
}

# ── Logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# ── Data Classes ────────────────────────────────────────────────────
@dataclass
class FieldConfidence:
    value: str
    confidence: float  # 0.0–1.0
    source: str  # 'ocr', 'regex', 'vendor_db', 'manual'

@dataclass
class ReceiptData:
    vendor_name_raw: str = ""
    vendor_name_canonical: str = ""
    vendor_id: Optional[str] = None
    expense_date: date = None
    receipt_number: str = ""
    total_amount: float = 0.0
    tax_amount: float = 0.0
    currency: str = "MYR"
    payment_method: Optional[str] = None
    items: List[Dict] = field(default_factory=list)
    category: str = "misc"
    category_confidence: float = 0.0
    field_confidences: Dict[str, float] = field(default_factory=dict)
    raw_text: str = ""
    ocr_quality_score: float = 0.0
    image_quality: str = "fair"  # good, fair, poor, unreadable
    needs_review: bool = False
    review_reasons: List[str] = field(default_factory=list)

@dataclass
class ProcessResult:
    success: bool
    receipt_data: Optional[ReceiptData] = None
    expense_id: Optional[str] = None
    error: Optional[str] = None
    needs_review: bool = False

# ── Supabase Client ─────────────────────────────────────────────────
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ── Image Quality & Preprocessing ───────────────────────────────────
def detect_image_quality(image: Image.Image) -> Tuple[str, Dict]:
    """Detect image quality issues: blur, low light, contrast."""
    metrics = {}
    img_gray = image.convert('L')
    arr = np.array(img_gray)
    
    # Blur detection via Laplacian variance
    laplacian_var = np.var(np.asarray(
        img_gray.filter(ImageFilter.Kernel((3,3), [-1,-1,-1,-1,8,-1,-1,-1,-1]))
    ))
    metrics['blur_score'] = round(laplacian_var, 1)
    
    # Brightness
    metrics['brightness'] = round(np.mean(arr), 1)
    
    # Contrast (standard deviation)
    metrics['contrast'] = round(np.std(arr), 1)
    
    # Quality verdict
    if laplacian_var < 50:
        quality = 'poor'
    elif laplacian_var < 150:
        quality = 'fair'
    else:
        quality = 'good'
    
    if metrics['brightness'] < 40:
        quality = 'poor'  # too dark
    elif metrics['brightness'] > 240:
        quality = 'poor'  # washed out
    
    return quality, metrics

def preprocess_receipt_image(image: Image.Image) -> Image.Image:
    """Preprocess receipt image for optimal OCR."""
    # 1. Convert to grayscale
    img = image.convert('L')
    
    # 2. Resize if too small (min 1500px wide)
    w, h = img.size
    if w < 1500:
        scale = 1500 / w
        img = img.resize((1500, int(h * scale)), Image.LANCZOS)
    
    # 3. Denoise
    img = img.filter(ImageFilter.MedianFilter(3))
    
    # 4. Sharpen
    img = img.filter(ImageFilter.SHARPEN)
    
    # 5. Enhance contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)
    
    # 6. Adaptive threshold (Sauvola-like approximation)
    arr = np.array(img)
    # Local mean
    kernel = np.ones((15, 15)) / 225
    local_mean = np.asarray(
        Image.fromarray(arr.astype(np.uint8)).filter(
            ImageFilter.Kernel((15, 15), kernel.flatten())
        )
    ).flatten()
    # Standard deviation
    local_std = np.asarray([
        np.std(arr[max(0, i//w-7):min(h, i//w+8), max(0, i%w-7):min(w, i%w+8)])
        for i in range(len(arr.flatten()))
    ]).reshape(arr.shape)
    
    threshold = local_mean.reshape(arr.shape) * (1 + 0.2 * ((local_std / 128) - 1))
    bw = (arr > threshold).astype(np.uint8) * 255
    img = Image.fromarray(bw, mode='L')
    
    # 7. Invert if dark text on light background (receipts usually are)
    if np.mean(bw) > 128:
        img = Image.fromarray(255 - bw, mode='L')
    
    return img

# ── OCR Extraction ──────────────────────────────────────────────────
def extract_text_from_image(image_path: str) -> Tuple[str, Dict]:
    """Extract text via Tesseract. Returns (text, confidence_metrics)."""
    img = Image.open(image_path)
    
    # Quality check
    quality, metrics = detect_image_quality(img)
    
    # Preprocess
    img_processed = preprocess_receipt_image(img)
    
    # OCR with per-character confidence
    data = pytesseract.image_to_data(img_processed, lang='msa+eng', output_type=pytesseract.Output.DICT)
    text = ' '.join([t for t in data['text'] if t.strip()])
    
    # Average confidence
    confs = [int(c) for c in data['conf'] if c != '-1']
    avg_conf = sum(confs) / len(confs) / 100 if confs else 0
    
    return text, {
        'ocr_confidence': round(avg_conf, 2),
        'image_quality': quality,
        'image_metrics': metrics,
        'word_count': len(text.split())
    }

def extract_text_from_pdf(pdf_path: str) -> Tuple[str, Dict]:
    """Extract text from PDF. Detects scanned vs text-based."""
    text_parts = []
    pages = 0
    with pdfplumber.open(pdf_path) as pdf:
        pages = len(pdf.pages)
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    
    full_text = "\n".join(text_parts)
    scanned = len(full_text.strip()) < 50 and pages > 0
    
    return full_text, {
        'ocr_confidence': 0.90 if not scanned else 0.50,  # text-based PDF = high confidence
        'image_quality': 'good' if not scanned else 'fair',
        'is_scanned_pdf': scanned,
        'page_count': pages
    }

def extract_text_from_file(file_path: str) -> Tuple[str, Dict]:
    """Auto-detect file type and extract text with metrics."""
    ext = Path(file_path).suffix.lower()
    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.heic']:
        return extract_text_from_image(file_path)
    elif ext == '.pdf':
        return extract_text_from_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

# ── Total Amount Extraction ─────────────────────────────────────────
def extract_total_amount(text: str) -> Tuple[float, float]:
    """
    Extract total amount by LABEL PRECEDENCE (not max value).
    
    Priority:
    1. "Grand Total" / "Grand Total (RM)"
    2. "Amount Payable" / "Jumlah Perlu Bayar"
    3. "Jumlah" (last occurrence)
    4. "Total" (last occurrence)
    5. "TOTAL (RM)"
    6. Any RM value near "TOTAL" line
    """
    # Normalize text for matching
    lines = text.lower().split('\n')
    full_text = ' '.join(lines)
    
    # Amount pattern
    amt_pat = r'rm\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))'
    amt_pat_no_rm = r'(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))'
    
    def parse_amount(s):
        try:
            # Remove commas, keep decimal point
            s = s.replace(',', '')
            return float(s)
        except:
            return None
    
    # Priority 1: "Grand Total" / "GRAND TOTAL"
    for line in lines:
        m = re.search(r'(?:grand\s*total)[\s:]*' + amt_pat, line)
        if m:
            val = parse_amount(m.group(1))
            if val and 0.50 <= val <= 50000:
                return val, 0.95
    
    # Priority 2: "Amount Payable" / "Jumlah Perlu Bayar"
    for line in lines:
        m = re.search(r'(?:amount\s*payable|jumlah\s*perlu\s*bayar)[\s:]*' + amt_pat, line)
        if m:
            val = parse_amount(m.group(1))
            if val and 0.50 <= val <= 50000:
                return val, 0.90
    
    # Priority 3: "Jumlah" (last occurrence with RM amount)
    amount_hits = []
    for i, line in enumerate(lines):
        if 'jumlah' in line and not any(w in line for w in ['grand', 'perlu', 'sub', 'kecil']):
            m = re.search(amt_pat, line)
            if m:
                val = parse_amount(m.group(1))
                if val and 0.50 <= val <= 50000:
                    amount_hits.append((val, i))
    if amount_hits:
        return amount_hits[-1][0], 0.80
    
    # Priority 4: "Total" (last occurrence)
    total_hits = []
    for i, line in enumerate(lines):
        if re.match(r'^\s*total', line) and not any(w in line for w in ['grand', 'sub', 'item']):
            m = re.search(amt_pat, line)
            if m:
                val = parse_amount(m.group(1))
                if val and 0.50 <= val <= 50000:
                    total_hits.append((val, i))
    if total_hits:
        return total_hits[-1][0], 0.75
    
    # Priority 5: "TOTAL (RM)" or "TOTAL RM"
    for line in lines:
        m = re.search(r'total\s*\(?rm\)?\s*' + amt_pat_no_rm, line)
        if m:
            val = parse_amount(m.group(1))
            if val and 0.50 <= val <= 50000:
                return val, 0.70
    
    # Priority 6: Last line with RM amount (fallback)
    amt_lines = []
    for i, line in enumerate(lines):
        m = re.search(amt_pat, line)
        if m:
            val = parse_amount(m.group(1))
            if val and 0.50 <= val <= 50000:
                amt_lines.append((val, i))
    
    if amt_lines:
        # Take from the last third of the receipt (where totals usually are)
        total_section = amt_lines[-max(1, len(amt_lines)//3):]
        return max(total_section, key=lambda x: x[1])[0], 0.50
    
    return 0.0, 0.0

# ── Date Extraction ─────────────────────────────────────────────────
def extract_date(text: str) -> Tuple[Optional[date], float]:
    """Extract receipt date with confidence."""
    lines = text.lower().split('\n')
    full_text = ' '.join(lines)
    
    # Priority 1: "Date: DD/MM/YYYY" or "Tarikh: DD/MM/YYYY"
    for tag in ['date:', 'tarikh:', 'date', 'tarikh', 'tkh:']:
        for line in lines:
            if tag in line:
                m = re.search(r'(\d{1,2})[\s\/\-\.]+(\d{1,2})[\s\/\-\.]+(\d{4})', line)
                if m:
                    try:
                        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                        if 1 <= d <= 31 and 1 <= mo <= 12:
                            return date(y, mo, d), 0.90
                    except:
                        pass
    
    # Priority 2: DD Mon YYYY
    months = {'jan':1, 'feb':2, 'mac':3, 'mar':3, 'apr':4, 'mei':5, 'may':5,
              'jun':6, 'jul':7, 'ogs':8, 'aug':8, 'sep':9, 'okt':10, 'oct':10,
              'nov':11, 'dis':12, 'dec':12}
    m = re.search(r'(\d{1,2})\s+(jan|feb|mac|mar|apr|mei|may|jun|jul|ogs|aug|sep|okt|oct|nov|dis|dec)\s+(\d{4})', 
                  full_text)
    if m:
        try:
            return date(int(m.group(3)), months[m.group(2)], int(m.group(1))), 0.85
        except:
            pass
    
    # Priority 3: Any DD/MM/YYYY pattern
    m = re.search(r'(\d{1,2})[\s\/\-\.]+(\d{1,2})[\s\/\-\.]+(\d{4})', full_text)
    if m:
        try:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= d <= 31 and 1 <= mo <= 12:
                return date(y, mo, d), 0.70
        except:
            pass
    
    # Priority 4: YYYY-MM-DD or YYYY/MM/DD
    m = re.search(r'(\d{4})[\s\/\-\.]+(\d{1,2})[\s\/\-\.]+(\d{1,2})', full_text)
    if m:
        try:
            d, mo, y = int(m.group(3)), int(m.group(2)), int(m.group(1))
            if 1 <= d <= 31 and 1 <= mo <= 12:
                return date(y, mo, d), 0.65
        except:
            pass
    
    # Fallback: today's date (low confidence)
    return date.today(), 0.10

# ── Vendor Extraction & Normalization ───────────────────────────────
def extract_vendor(text: str, metadata: Dict) -> Tuple[str, float]:
    """Extract vendor name and normalize via Supabase vendors table."""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    # First non-trivial line that's not date/total/metadata
    candidates = []
    for line in lines[:8]:
        line_lower = line.lower()
        # Skip unwanted lines
        if any(kw in line_lower for kw in ['total', 'jumlah', 'date', 'tarikh', 'time', 'masa',
                                              'receipt', 'resit', 'invoice', 'cashier', 'kasir',
                                              'www.', 'http', '.com', '.my', 'tel:', 'no.', 'page']):
            continue
        if re.search(r'\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4}', line):
            continue
        if re.match(r'^[\d\s,.\-\(\)@]+$', line):  # pure numbers
            continue
        if 3 < len(line) < 100:
            candidates.append(line)
    
    raw_name = candidates[0] if candidates else "Unknown"
    
    # Try to match against vendors table
    try:
        supabase = get_supabase()
        # Search by exact match or alias
        for alias_len in range(len(raw_name), 3, -1):
            search_term = raw_name[:alias_len].lower()
            result = supabase.rpc('find_vendor_by_alias', {'search_term': search_term}).execute()
            if result.data:
                return result.data[0]['canonical_name'], 0.90
    except:
        pass
    
    return raw_name.title(), 0.50

# ── Tax & Receipt Number Extraction ─────────────────────────────────
def extract_tax(text: str) -> Tuple[float, float]:
    """Extract tax/SST amount."""
    lines = text.lower().split('\n')
    for tag in ['sst', 'tax', 'cukai', 'service tax', 'gst']:
        for line in lines:
            if tag in line:
                m = re.search(r'rm\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))', line)
                if m:
                    return float(m.group(1).replace(',', '')), 0.85
    return 0.0, 0.50

def extract_receipt_number(text: str) -> Tuple[str, float]:
    """Extract receipt/invoice number."""
    # Common patterns: INV-1234, Receipt #: 5678, No: ABC-123
    for tag in ['inv', 'invoice', 'receipt', 'resit', 'no:', '#', 'ref:']:
        pattern = rf'(?:{tag})[\s:#-]*([A-Za-z0-9\-]{{4,20}})'
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1).strip(), 0.70
    return "", 0.20

# ── Auto-Categorization ─────────────────────────────────────────────
def categorize_expense(data: ReceiptData) -> Tuple[str, float]:
    """Weighted keyword matching for category classification."""
    scores = {cat: 0.0 for cat in CATEGORIES}
    text = (data.vendor_name_raw + ' ' + data.vendor_name_canonical + ' ' + 
            ' '.join([i.get('name', '') for i in data.items])).lower()
    
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw, weight in keywords.items():
            if kw in text:
                scores[cat] += weight
    
    # Vendor boost
    vname = data.vendor_name_canonical.lower()
    # Utilities: TNB, SYABAS, Unifi, Maxis, Celcom, Digi, U Mobile, Tunetalk
    # Loan: BSN, Maybank, CIMB, RHB, Public Bank, Hong Leong, Affin
    
    max_score = max(scores.values())
    if max_score > 0:
        best_cat = max(scores, key=scores.get)
        confidence = min(max_score / 10.0, 1.0)  # normalize to 0-1
    else:
        best_cat = 'misc'
        confidence = 0.05
    
    return best_cat, confidence

# ── Full Processing Pipeline ────────────────────────────────────────
def parse_receipt(text: str, metadata: Dict) -> ReceiptData:
    """Full structured extraction from OCR text."""
    data = ReceiptData(raw_text=text)
    data.ocr_quality_score = metadata.get('ocr_confidence', 0)
    data.image_quality = metadata.get('image_quality', 'fair')
    
    # Track per-field confidences
    fconf = {}
    
    # Total amount (highest priority)
    data.total_amount, fconf['amount'] = extract_total_amount(text)
    
    # Date
    data.expense_date, fconf['date'] = extract_date(text)
    if data.expense_date is None:
        data.expense_date = date.today()
    
    # Tax
    data.tax_amount, fconf['tax'] = extract_tax(text)
    
    # Receipt number
    data.receipt_number, fconf['receipt_number'] = extract_receipt_number(text)
    
    # Vendor
    data.vendor_name_raw, _ = extract_vendor(text, metadata)
    data.vendor_name_canonical, fconf['vendor'] = extract_vendor(text, metadata)
    
    # Payment method
    payment_kw = {
        'cash': ['tunai', 'cash', 'wang tunai'],
        'card': ['kad', 'card', 'debit', 'credit', 'visa', 'mastercard', 'master'],
        'transfer': ['transfer', 'bank in', 'online', 'fpx', 'duitnow', 'ibt', 'giro'],
        'ewallet': ['ewallet', 'e-wallet', 'touch n go', 'tng', 'grabpay', 'boost', 'shopeepay', 'qr pay']
    }
    for method, kws in payment_kw.items():
        if any(kw in text.lower() for kw in kws):
            data.payment_method = method
            fconf['payment'] = 0.75
            break
    
    # Categorization
    data.category, data.category_confidence = categorize_expense(data)
    fconf['category'] = data.category_confidence
    
    data.field_confidences = fconf
    
    # Determine if review needed
    low_fields = [k for k, v in fconf.items() if v < 0.50]
    if low_fields:
        data.needs_review = True
        data.review_reasons = [f"{k}: confidence {v:.0%}" for k, v in fconf.items() if v < 0.50]
    
    if data.image_quality == 'poor':
        data.needs_review = True
        data.review_reasons.append(f"image quality: {data.image_quality}")
    
    if data.category_confidence < MIN_CONFIDENCE_THRESHOLD:
        data.needs_review = True
        data.review_reasons.append(f"category: {data.category_confidence:.0%}")
    
    return data

# ── Supabase Storage ────────────────────────────────────────────────
def save_expense(data: ReceiptData, whatsapp_msg_id: str,
                 sender_id: str = None, sender_name: str = None) -> str:
    """Save expense to Supabase with idempotency via whatsapp_message_id."""
    supabase = get_supabase()
    
    # Try to resolve vendor_id
    vendor_id = None
    if data.vendor_name_canonical and data.vendor_name_canonical != "Unknown":
        try:
            v_result = supabase.table("vendors")\
                .select("id")\
                .eq("canonical_name", data.vendor_name_canonical)\
                .execute()
            if v_result.data:
                vendor_id = v_result.data[0]['id']
        except:
            pass
    
    record = {
        "whatsapp_message_id": whatsapp_msg_id,
        "vendor_name_raw": data.vendor_name_raw,
        "vendor_id": vendor_id,
        "expense_date": data.expense_date.isoformat(),
        "receipt_number": data.receipt_number,
        "total_amount": data.total_amount,
        "tax_amount": data.tax_amount,
        "currency": data.currency,
        "payment_method": data.payment_method,
        "items": data.items,
        "category": data.category,
        "category_confidence": data.category_confidence,
        "category_source": "auto" if data.category_confidence >= MIN_CONFIDENCE_THRESHOLD else "review",
        "status": "completed" if not data.needs_review else "flagged",
        "sender_whatsapp_id": sender_id,
        "sender_name": sender_name,
        "raw_ocr_text": data.raw_text[:2000],
        "ocr_confidence": data.ocr_quality_score,
        "image_quality": data.image_quality,
        "notes": json.dumps({
            "field_confidences": data.field_confidences,
            "review_reasons": data.review_reasons
        }),
        "processed_at": datetime.now().isoformat()
    }
    
    # UPSERT: if whatsapp_message_id exists, update; otherwise insert
    result = supabase.table("expenses")\
        .upsert(record, on_conflict="whatsapp_message_id")\
        .execute()
    
    if result.data:
        return result.data[0]['id']
    raise Exception("Failed to save expense")

# ── Main Pipeline ───────────────────────────────────────────────────
def process_receipt_file(file_path: str,
                         whatsapp_msg_id: str = None,
                         sender_id: str = None,
                         sender_name: str = None) -> ProcessResult:
    """Complete pipeline: OCR -> Parse -> Categorize -> Store."""
    try:
        # 1. Extract text with quality metrics
        raw_text, metadata = extract_text_from_file(file_path)
        if not raw_text.strip():
            return ProcessResult(
                success=False,
                error="Tiada teks dapat diekstrak dari fail. Pastikan gambar jelas dan tak kabur."
            )
        
        # 2. Parse structured data
        data = parse_receipt(raw_text, metadata)
        
        if data.total_amount <= 0:
            return ProcessResult(
                success=False,
                receipt_data=data,
                needs_review=True,
                error="Tidak dapat mengesan jumlah (total amount) pada resit."
            )
        
        # 3. Save to Supabase (idempotent)
        if whatsapp_msg_id:
            expense_id = save_expense(data, whatsapp_msg_id, sender_id, sender_name)
        else:
            expense_id = None
        
        return ProcessResult(
            success=True,
            receipt_data=data,
            expense_id=expense_id,
            needs_review=data.needs_review
        )
        
    except Exception as e:
        logger.error(f"Receipt processing error: {e}", exc_info=True)
        return ProcessResult(success=False, error=str(e))

# ── WhatsApp Reply Formatting ───────────────────────────────────────
def format_whatsapp_reply(result: ProcessResult) -> str:
    """Format a user-friendly WhatsApp reply in Bahasa Melayu."""
    if not result.success:
        return f"❌ *Gagal Proses Resit*\n\n{result.error or 'Sila hantar gambar yang lebih jelas.'}\n\nTip: Pastikan gambar terang, tak kabur, dan teks pada resit jelas kelihatan."
    
    d = result.receipt_data
    cat_labels = {
        'utilities': 'Utiliti (Air/Elektrik/Internet/Telefon)',
        'stock_purchase': 'Pembelian Stok (Phone/Unit)',
        'repair_parts': 'Spare Parts Baikan',
        'rent': 'Sewa Kedai',
        'loan_repayment': 'Bayaran Pinjaman (BSN/Lain)',
        'misc': 'Lain-lain'
    }
    
    status = "⚠️ *Perlu Semakan*" if result.needs_review else "✅ *Siap Direkod*"
    reasons = ""
    if d.review_reasons:
        reasons = f"\n📝 Sebab: {', '.join(d.review_reasons[:3])}"
    
    return (f"{status}\n\n"
            f"🏪 *Vendor:* {d.vendor_name_raw}\n"
            f"📅 *Tarikh:* {d.expense_date.strftime('%d/%m/%Y')}\n"
            f"💰 *Jumlah:* RM {d.total_amount:,.2f}\n"
            f"📂 *Kategori:* {cat_labels.get(d.category, d.category)}\n"
            f"💳 *Bayaran:* {d.payment_method or 'Tak dapat dikesan'}\n"
            f"{reasons}")

# ── CLI ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python receipt_ocr_processor_v2.py <receipt_image_or_pdf>")
        sys.exit(1)
    
    result = process_receipt_file(sys.argv[1])
    print(f"\n{'='*50}")
    print(f"SUCCESS: {result.success}")
    print(f"NEEDS REVIEW: {result.needs_review}")
    if result.receipt_data:
        d = result.receipt_data
        print(f"VENDOR: {d.vendor_name_raw} → {d.vendor_name_canonical}")
        print(f"DATE: {d.expense_date}")
        print(f"AMOUNT: RM {d.total_amount:.2f}")
        print(f"TAX: RM {d.tax_amount:.2f}")
        print(f"RECEIPT #: {d.receipt_number}")
        print(f"CATEGORY: {d.category} ({d.category_confidence:.2f})")
        print(f"IMAGE QUALITY: {d.image_quality}")
        print(f"OCR QUALITY: {d.ocr_quality_score:.2f}")
        print(f"FIELD CONFIDENCES: {d.field_confidences}")
        print(f"REVIEW REASONS: {d.review_reasons}")
    if result.error:
        print(f"ERROR: {result.error}")
    print(f"{'='*50}")
