#!/usr/bin/env python3
"""
receipt_ocr_processor.py — HAFJET Receipt OCR & Auto-Categorization

Extracts structured data from receipt images/PDFs via WhatsApp,
auto-categorizes expenses, stores in Supabase, and replies confirmation.

Dependencies:
    pip install pytesseract pillow pdfplumber supabase python-dotenv

System:
    apt-get install tesseract-ocr tesseract-ocr-msa  # Malay language support
"""

import os
import re
import json
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, asdict
from io import BytesIO

import pytesseract
from PIL import Image
import pdfplumber
from supabase import create_client, Client
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service role for backend
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")

# HAFJET expense categories
CATEGORIES = [
    "utilities",
    "stock_purchase", 
    "repair_parts",
    "rent",
    "loan_repayment",
    "misc"
]

# Category keywords for auto-classification (Malay/English)
CATEGORY_KEYWORDS = {
    "utilities": [
        "tnb", "tenaga", "elektrik", "electric", "air", "water", "syabas",
        "internet", "unifi", "streamyx", "maxis", "fibre", "broadband",
        "wifi", "phone", "telefon", "celcom", "digi", "hotlink", "umobile",
        "bill", "payment", "bayaran"
    ],
    "stock_purchase": [
        "phone", "fon", "handphone", "smartphone", "iphone", "samsung",
        "vivo", "oppo", "xiaomi", "realme", "redmi", "poco", "infinix",
        "tecnop", "stock", "inventori", "pembelian", "supplier", "distributor",
        "unit", "set", "carton", "box"
    ],
    "repair_parts": [
        "lcd", "screen", "skrin", "battery", "bateri", "charging port",
        "port cas", "flex", "kabel", "cable", "camera", "kamera",
        "speaker", "mic", "vibrator", "button", "tombol", "back cover",
        "casing", "frame", "motherboard", "ic", "parts", "spare", "komponen",
        "repair", "baiki", "servis", "ganti"
    ],
    "rent": [
        "sewa", "rental", "kedai", "shop", "lot", "premis", "premise",
        "bayaran sewa", "deposit", "tenancy"
    ],
    "loan_repayment": [
        "bsn", "bank simpanan", "pinjaman", "loan", "angsuran", "repayment",
        "installment", "cicilan", "bank", "maybank", "cimb", "rhb",
        "public bank", "hong leong", "affin"
    ],
    "misc": [
        "stationery", "alat tulis", "printing", "cetak", "photostat",
        "kertas", "ink", "catridge", "toner", "maintenance", "pemeliharaan",
        "cleaning", "kebersihan", "security", "keselamatan", "insurance",
        "insurans", "license", "lesen", "permit", "permit"
    ]
}

# Vendor name normalization
VENDOR_ALIASES = {
    "tnb": "TNB",
    "tenaga nasional": "TNB",
    "syabas": "SYABAS",
    "unifi": "Unifi",
    "tm": "TM",
    "maxis": "Maxis",
    "celcom": "Celcom",
    "digi": "Digi",
    "hotlink": "Hotlink",
    "umobile": "U Mobile",
    "bsn": "BSN",
    "bank simpanan nasional": "BSN",
}

# ── Data Classes ────────────────────────────────────────────────────
@dataclass
class ReceiptData:
    vendor_name: str
    expense_date: date
    total_amount: float
    currency: str = "MYR"
    payment_method: Optional[str] = None
    items: List[Dict] = None
    category: str = "misc"
    category_confidence: float = 0.0
    raw_text: str = ""
    
    def __post_init__(self):
        if self.items is None:
            self.items = []

@dataclass
class ProcessResult:
    success: bool
    receipt_data: Optional[ReceiptData] = None
    expense_id: Optional[str] = None
    error: Optional[str] = None
    needs_review: bool = False

# ── Supabase Client ─────────────────────────────────────────────────
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ── OCR Functions ───────────────────────────────────────────────────
def extract_text_from_image(image_path: str) -> str:
    """Extract text from image using Tesseract OCR."""
    img = Image.open(image_path)
    # Preprocess: convert to grayscale, enhance contrast
    img = img.convert('L')
    # Use Malay + English language
    text = pytesseract.image_to_string(img, lang='msa+eng')
    return text

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using pdfplumber."""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n".join(text_parts)

def extract_text_from_file(file_path: str) -> str:
    """Auto-detect file type and extract text."""
    ext = Path(file_path).suffix.lower()
    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
        return extract_text_from_image(file_path)
    elif ext == '.pdf':
        return extract_text_from_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

# ── Parsing Functions ───────────────────────────────────────────────
def parse_receipt_text(text: str) -> ReceiptData:
    """Parse raw OCR text into structured ReceiptData."""
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    full_text = ' '.join(lines).lower()
    
    # Initialize
    data = ReceiptData(
        vendor_name="Unknown",
        expense_date=date.today(),
        total_amount=0.0,
        raw_text=text
    )
    
    # Extract total amount - look for patterns like RM XX.XX, Total: XX.XX
    amount_patterns = [
        r'(?:total|jumlah|amount)[\s:]*rm?\s*(\d+[.,]\d{2})',
        r'rm\s*(\d+[.,]\d{2})',
        r'(\d+[.,]\d{2})\s*(?:rm|myr)',
        r'(?:grand total|total bayaran)[\s:]*rm?\s*(\d+[.,]\d{2})',
    ]
    
    amounts = []
    for pattern in amount_patterns:
        matches = re.findall(pattern, full_text, re.IGNORECASE)
        for m in matches:
            try:
                val = float(m.replace(',', '.'))
                if 0.50 <= val <= 50000:  # reasonable range
                    amounts.append(val)
            except:
                pass
    
    if amounts:
        # Take the largest reasonable amount as total
        data.total_amount = max(amounts)
    
    # Extract date - various formats
    date_patterns = [
        r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})',  # DD/MM/YYYY
        r'(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})',  # YYYY/MM/DD
        r'(\d{1,2})\s+(jan|feb|mac|mar|apr|mei|may|jun|jul|ogs|aug|sep|okt|oct|nov|dis|dec)\s+(\d{4})',
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            try:
                groups = match.groups()
                if len(groups) == 3:
                    if groups[0].isdigit() and len(groups[0]) == 4:
                        # YYYY/MM/DD
                        data.expense_date = date(int(groups[0]), int(groups[1]), int(groups[2]))
                    elif groups[1].isdigit():
                        # DD/MM/YYYY
                        data.expense_date = date(int(groups[2]), int(groups[1]), int(groups[0]))
                    else:
                        # DD Mon YYYY
                        month_map = {
                            'jan':1, 'feb':2, 'mac':3, 'mar':3, 'apr':4, 'mei':5, 'may':5,
                            'jun':6, 'jul':7, 'ogs':8, 'aug':8, 'sep':9, 'okt':10, 'oct':10,
                            'nov':11, 'dis':12, 'dec':12
                        }
                        m = month_map.get(groups[1].lower()[:3], 1)
                        data.expense_date = date(int(groups[2]), m, int(groups[0]))
                break
            except:
                pass
    
    # Extract vendor name - usually first few lines
    vendor_candidates = []
    for line in lines[:5]:
        line_lower = line.lower()
        # Skip lines that look like addresses, dates, totals
        if any(kw in line_lower for kw in ['total', 'jumlah', 'date', 'tarikh', 'time', 'masa', 'receipt', 'resit', 'invoice']):
            continue
        if re.search(r'\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}', line):
            continue
        if len(line) > 3 and len(line) < 80:
            vendor_candidates.append(line)
    
    if vendor_candidates:
        data.vendor_name = vendor_candidates[0]
        # Normalize known vendors
        v_lower = data.vendor_name.lower()
        for alias, canonical in VENDOR_ALIASES.items():
            if alias in v_lower:
                data.vendor_name = canonical
                break
    
    # Extract payment method
    payment_keywords = {
        'cash': ['tunai', 'cash'],
        'card': ['kad', 'card', 'debit', 'credit', 'visa', 'master'],
        'transfer': ['transfer', 'bank in', 'online', 'fpx', 'duitnow'],
        'ewallet': ['ewallet', 'e-wallet', 'touch n go', 'tng', 'grabpay', 'boost', 'shopeepay']
    }
    for method, keywords in payment_keywords.items():
        if any(kw in full_text for kw in keywords):
            data.payment_method = method
            break
    
    # Extract line items (simplified - look for qty x price patterns)
    item_pattern = r'(\d+)\s*[xX]\s*rm?\s*(\d+[.,]\d{2})'
    items = re.findall(item_pattern, full_text)
    for qty_str, price_str in items:
        try:
            data.items.append({
                "name": "Item",
                "quantity": int(qty_str),
                "unit_price": float(price_str.replace(',', '.')),
                "total": int(qty_str) * float(price_str.replace(',', '.'))
            })
        except:
            pass
    
    return data

# ── Auto-Categorization ─────────────────────────────────────────────
def categorize_expense(data: ReceiptData) -> Tuple[str, float]:
    """Auto-categorize expense based on vendor and items."""
    scores = {cat: 0.0 for cat in CATEGORIES}
    text = (data.vendor_name + ' ' + ' '.join([i.get('name', '') for i in data.items])).lower()
    
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[cat] += 1.0
    
    # Boost based on vendor
    vendor_lower = data.vendor_name.lower()
    if any(v in vendor_lower for v in ['tnb', 'tenaga', 'unifi', 'maxis', 'celcom', 'digi', 'hotlink', 'umobile']):
        scores['utilities'] += 3
    if any(v in vendor_lower for v in ['bsn', 'bank']):
        scores['loan_repayment'] += 3
    if 'sewa' in vendor_lower or 'rental' in vendor_lower:
        scores['rent'] += 3
    
    # Normalize scores
    max_score = max(scores.values())
    if max_score > 0:
        best_cat = max(scores, key=scores.get)
        confidence = min(max_score / 5.0, 1.0)  # cap at 1.0
    else:
        best_cat = 'misc'
        confidence = 0.1
    
    return best_cat, confidence

# ── Supabase Operations ─────────────────────────────────────────────
def save_expense(data: ReceiptData, whatsapp_msg_id: str = None, 
                 sender_id: str = None, sender_name: str = None,
                 image_url: str = None, drive_file_id: str = None) -> str:
    """Save expense to Supabase, return expense ID."""
    supabase = get_supabase()
    
    record = {
        "vendor_name": data.vendor_name,
        "expense_date": data.expense_date.isoformat(),
        "total_amount": data.total_amount,
        "currency": data.currency,
        "payment_method": data.payment_method,
        "items": data.items,
        "category": data.category,
        "category_confidence": data.category_confidence,
        "category_source": "auto" if data.category_confidence >= 0.7 else "review",
        "status": "completed" if data.category_confidence >= 0.7 else "flagged",
        "receipt_image_url": image_url,
        "receipt_drive_file_id": drive_file_id,
        "whatsapp_message_id": whatsapp_msg_id,
        "sender_whatsapp_id": sender_id,
        "sender_name": sender_name,
        "notes": f"Auto-processed from WhatsApp. Raw text preview: {data.raw_text[:200]}",
        "processed_at": datetime.now().isoformat()
    }
    
    result = supabase.table("expenses").insert(record).execute()
    if result.data:
        return result.data[0]['id']
    raise Exception("Failed to insert expense")

def get_monthly_expenses(year: int, month: int) -> Dict[str, float]:
    """Get expense totals by category for a month."""
    supabase = get_supabase()
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    
    result = supabase.table("expenses")\
        .select("category, total_amount")\
        .eq("status", "completed")\
        .gte("expense_date", start.isoformat())\
        .lt("expense_date", end.isoformat())\
        .execute()
    
    totals = {cat: 0.0 for cat in CATEGORIES}
    for row in result.data:
        cat = row['category']
        if cat in totals:
            totals[cat] += float(row['total_amount'])
    return totals

# ── Main Processing Function ────────────────────────────────────────
def process_receipt_file(file_path: str, 
                         whatsapp_msg_id: str = None,
                         sender_id: str = None,
                         sender_name: str = None,
                         image_url: str = None,
                         drive_file_id: str = None) -> ProcessResult:
    """Complete pipeline: OCR -> Parse -> Categorize -> Store."""
    try:
        # 1. Extract text
        raw_text = extract_text_from_file(file_path)
        if not raw_text.strip():
            return ProcessResult(success=False, error="No text extracted from file")
        
        # 2. Parse structured data
        data = parse_receipt_text(raw_text)
        if data.total_amount <= 0:
            return ProcessResult(success=False, error="Could not determine total amount", 
                               receipt_data=data, needs_review=True)
        
        # 3. Auto-categorize
        data.category, data.category_confidence = categorize_expense(data)
        
        # 4. Save to Supabase
        expense_id = save_expense(data, whatsapp_msg_id, sender_id, sender_name,
                                image_url, drive_file_id)
        
        return ProcessResult(
            success=True,
            receipt_data=data,
            expense_id=expense_id,
            needs_review=data.category_confidence < 0.7
        )
        
    except Exception as e:
        logging.error(f"Receipt processing error: {e}")
        return ProcessResult(success=False, error=str(e))

# ── WhatsApp Reply ──────────────────────────────────────────────────
def format_whatsapp_reply(result: ProcessResult) -> str:
    """Format confirmation message for WhatsApp."""
    if not result.success or not result.receipt_data:
        return "❌ Maaf, tak berjaya proses resit tu. Sila taip manual atau hantar gambar lebih jelas."
    
    d = result.receipt_data
    cat_label = {
        'utilities': 'Utiliti (Air/Elektrik/Internet)',
        'stock_purchase': 'Pembelian Stok (Phone/Unit)',
        'repair_parts': 'Spare Parts Baikan',
        'rent': 'Sewa Kedai',
        'loan_repayment': 'Bayaran Pinjaman',
        'misc': 'Lain-lain'
    }.get(d.category, d.category)
    
    status_emoji = "✅" if not result.needs_review else "⚠️"
    review_note = "\n⚠️ *Kategori perlukan semakan manual*" if result.needs_review else ""
    
    return (f"{status_emoji} *Resit Direkodkan*\n\n"
            f"🏪 Vendor: {d.vendor_name}\n"
            f"📅 Tarikh: {d.expense_date.strftime('%d/%m/%Y')}\n"
            f"💰 Jumlah: RM {d.total_amount:.2f}\n"
            f"📂 Kategori: {cat_label}\n"
            f"💳 Bayaran: {d.payment_method or '-'}\n"
            f"{review_note}")

# ── CLI for testing ─────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python receipt_ocr_processor.py <image_or_pdf_path>")
        sys.exit(1)
    
    result = process_receipt_file(sys.argv[1])
    print(f"Success: {result.success}")
    if result.receipt_data:
        print(f"Vendor: {result.receipt_data.vendor_name}")
        print(f"Date: {result.receipt_data.expense_date}")
        print(f"Amount: RM {result.receipt_data.total_amount:.2f}")
        print(f"Category: {result.receipt_data.category} ({result.receipt_data.category_confidence:.2f})")
        print(f"Items: {result.receipt_data.items}")
        print(f"Expense ID: {result.expense_id}")
        print(f"Needs review: {result.needs_review}")
    if result.error:
        print(f"Error: {result.error}")