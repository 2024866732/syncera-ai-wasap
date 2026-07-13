# Message Templates — HAFJET

## WhatsApp Customer Templates

### Sale Completed (Paid)
```
Terima kasih, {customer_name}! 🙏

Pesanan #{order_id} telah berjaya dibayar:
• Jumlah: RM {amount_total}
• Items: {items_summary}

Resit akan dihantar melalui email jika ada alamat email.

Terima kasih kerana membeli di HAFJET! 😊
```

### Repair — Received
```
Hai {customer_name}! 👋

Peranti anda sudah kami terima dan sedang masuk queue pemeriksaan.

Tiket: #{ticket_id}
Kami akan hubungi anda selepas selesai pemeriksaan.

Terima kasih — HAFJET
```

### Repair — Diagnosing
```
Hai {customer_name}! 🔍

Kami sedang periksa masalah peranti anda.

Tiket: #{ticket_id}
Status: Dalam pemeriksaan

Kami akan update anda secepat mungkin.
— HAFJET
```

### Repair — Waiting for Part
```
Hai {customer_name}! 📦

Kami sedang tunggu spare part untuk teruskan pembaikan peranti anda.

Tiket: #{ticket_id}
Status: Menunggu parts

Kami akan hubungi anda bila part sampai.
— HAFJET
```

### Repair — In Progress
```
Hai {customer_name}! 🔧

Pembaikan peranti anda sedang dijalankan.

Tiket: #{ticket_id}
Status: Dalam pembaikan

Harap siap tidak lama lagi!
— HAFJET
```

### Repair — Ready for Pickup
```
Hai {customer_name}! ✅

Peranti anda sudah siap dan boleh diambil di kedai!

Tiket: #{ticket_id}
Lokasi: HAFJET Kulai

Waktu operasi: 10am-8pm
Harap bawa resit semasa pengambilan.

Terima kasih — HAFJET
```

### Repair — Completed
```
Hai {customer_name}! 🎉

Kes pembaikan #{ticket_id} telah selesai dan direkodkan.

Terima kasih kerana mempercayai HAFJET!
Jika ada masalah, jangan segan hubungi kami.
```

### Pickup Reminder (3+ days)
```
Hai {customer_name}! 📱

Peranti anda untuk tiket #{ticket_id} sudah siap untuk diambil di kedai.

Sila ambil pada bila-bila masa dalam waktu operasi (10am-8pm).

Terima kasih — HAFJET
```

### Low Stock Alert (Owner)
```
⚠️ STOK KRITIKAL — HAFJET

Item di bawah threshold:
{low_stock_items}

Cadangan reorder:
{reorder_suggestion}

Sila semak Loyverse untuk details.
```

---

## Gmail Templates

### Invoice Email
```
Subject: Invoice HAFJET — #{order_id}

Salam sejahtera {customer_name},

Terima kasih kerana membuat pembelian dengan HAFJET.

Detail Pesanan:
━━━━━━━━━━━━━━━━━━
Order ID: #{order_id}
Tarikh: {created_at}
Jumlah: RM {amount_total}
Status: {payment_status}
━━━━━━━━━━━━━━━━━━

Items:
{items_list}

Resit/Invoice: {invoice_url}

Jika ada sebarang pertanyaan, sila hubungi kami.

Terima kasih,
HAFJET (M) SDN BHD
https://hafjet.my
```

### Daily Sales Digest (Owner)
```
Subject: 📊 Laporan Jualan Harian — {date}

Ringkasan Jualan Hari Ini:
━━━━━━━━━━━━━━━━━━━━━━━━
Jumlah Jualan: RM {total_sales}
Bilangan Transaksi: {transaction_count}
Purata: RM {average_sale}

Top Items:
{top_items}

Payment Mix:
• Cash: RM {cash_total}
• QR/Online: RM {qr_total}

Isu Penting:
{exceptions}

━━━━━━━━━━━━━━━━━━━━━━━━
HAFJET Auto-Report
```
