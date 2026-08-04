#!/usr/bin/env bash
# HAFJET BI Agent - Deployment Script
# Run this on the server to set up the complete system

set -e

echo "🚀 HAFJET BI Agent Deployment"
echo "==============================="

# 1. Install system dependencies
echo "📦 Installing system dependencies..."
apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-msa \
    poppler-utils \
    python3-pip \
    python3-venv

# 2. Create virtual environment
echo "🐍 Setting up Python environment..."
cd /home/hafizi145/.hermes/skills
python3 -m venv venv
source venv/bin/activate

# 3. Install Python packages
echo "📚 Installing Python packages..."
pip install --upgrade pip
pip install -r requirements.txt

# 4. Verify OCR works
echo "🔍 Testing OCR..."
tesseract --version | head -1
tesseract --list-langs | grep -E "msa|eng"

# 5. Check environment file
echo "⚙️ Checking environment..."
if [ ! -f ~/.hermes/.env ]; then
    echo "⚠️  ~/.hermes/.env not found! Copy from .env.example and fill in values:"
    echo "   cp .env.example ~/.hermes/.env"
    echo "   nano ~/.hermes/.env"
else
    echo "✅ ~/.hermes/.env exists"
fi

# 6. Create Supabase table (manual step)
echo ""
echo "🗄️  Supabase Setup Required:"
echo "   1. Go to Supabase Dashboard > SQL Editor"
echo "   2. Run: supabase_expenses_schema.sql"
echo "   3. Verify 'expenses' table created"

# 7. Test scripts
echo ""
echo "🧪 Testing scripts..."
echo "   - Testing pnl_generator.py (dry run)..."
python3 pnl_generator.py --help

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. Fill in ~/.hermes/.env with all credentials"
echo "   2. Run Supabase schema in SQL Editor"
echo "   3. Test OCR: python3 receipt_ocr_processor.py <test_receipt.jpg>"
echo "   4. Test P&L: python3 pnl_generator.py 2026 07"
echo "   5. Deploy webhook: gunicorn whatsapp_webhook:app -b 0.0.0.0:8080"
echo "   6. Set Meta webhook URL to: https://your-domain.com/webhook"
echo ""
echo "📅 Cron Jobs Already Configured:"
echo "   - Daily Sales (21:00 MYT): 9408be4cd593"
echo "   - Monthly Tracker (22:00 MYT): 41a5046bdc08"
echo "   - Monthly P&L (22:00 MYT, 1st): bb8a6cae36e8"