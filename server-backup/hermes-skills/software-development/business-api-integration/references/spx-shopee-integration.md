# SPX Shopee Integration Notes

## Confirmed Endpoints

- `GET https://sp.spx.shopee.com.my/sp-api/point/order/collection/list`
  - Query: `inbound_time_start`, `inbound_time_end` (unix), `pageno`, `count`
  - Response: `data.list[]` with `id` (entity_id), `shipment_id`, `recipient_name`, `recipient_phone` (masked), `inbound_time`, `collect_time`, `outbound_time` (0 = NULL), `status` (int), `storage_id`
  - Total field in `data.total`

- `POST https://sp.spx.shopee.com.my/sp-api/order/show_secret`
  - Body: `{"entity_id": "...", "entity_type": 2, "info_type": 2, "query_id": tracking, "view_channel": 2}`
  - Response: `data.real_message` contains full phone

## Status Integer Mapping

1=ReadyForCollection, 2=Remind1, 3=Remind2, 4=Remind3, 5=Remind4, 6=Collected, 7=CollectionFailed, 8=Return_Outbound, 9=Return_Packing

## Rate Limits

No documented hard limit. Use 0.3s between list pages, 0.5s between show_secret calls.

## Auth

Cookie-based session. 401 on either endpoint means session expired.
