# Message Templates

## WhatsApp — Sale Completed

Hai {customer_name}, terima kasih kerana berurusan dengan HAFJET.
Pesanan anda ({order_id}) telah disahkan dengan jumlah RM{amount_total}.
Jika anda perlukan salinan invoice, kami akan hantar ke email anda.

## WhatsApp — Repair Received

Hai {customer_name}, peranti anda telah kami terima untuk pemeriksaan.
No. rujukan: {ticket_id}.
Kami akan update status selepas diagnos selesai.

## WhatsApp — Repair In Progress

Hai {customer_name}, pembaikan untuk rujukan {ticket_id} sedang dijalankan.
Kami akan maklumkan sebaik sahaja siap untuk diambil.

## WhatsApp — Ready Pickup

Hai {customer_name}, peranti anda untuk rujukan {ticket_id} sudah siap.
Boleh datang ambil di kedai HAFJET pada waktu operasi.

## WhatsApp — Pickup Reminder

Hai {customer_name}, peranti anda untuk rujukan {ticket_id} masih menunggu untuk diambil.
Jika anda perlukan masa tambahan atau wakil untuk pickup, balas mesej ini.

## Gmail — Invoice Dispatch

Subject: Invoice HAFJET - {order_id}

Salam sejahtera {customer_name},

Terima kasih kerana berurusan dengan HAFJET.
Dilampirkan / disertakan pautan invoice bagi pesanan {order_id} berjumlah RM{amount_total}.

Sekiranya anda perlukan bantuan lanjut, balas email ini.

Terima kasih.
HAFJET

## Owner Digest — Daily Sales

- Jumlah jualan hari ini: RM{daily_total}
- Bilangan transaksi: {txn_count}
- Top item: {top_item}
- Pending repair: {pending_repair_count}
- Low stock kritikal: {critical_stock_count}
- Exception perlu semakan: {exception_count}
