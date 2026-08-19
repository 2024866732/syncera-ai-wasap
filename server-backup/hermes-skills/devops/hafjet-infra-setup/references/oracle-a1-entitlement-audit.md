# Oracle A1 entitlement and SSH-recovery audit — Aug 2026

## Verified Oracle policy distinction

- Oracle's current Free Tier page shows **2 Ampere A1 OCPUs + 12 GB memory** for Always Free.
- Oracle's regional price list states a **paid (PAYG) tenancy** gets the first **3,000 A1 OCPU-hours + 18,000 GB-hours/month** free.
- A 4 OCPU / 24 GB VM running through a 31-day month consumes:
  - `4 × 744 = 2,976` OCPU-hours
  - `24 × 744 = 17,856` GB-hours
  - Thus it remains within that PAYG allowance, but with only **24 OCPU-hours / 144 GB-hours** headroom. Do not add A1 resources or increase shape without a cost review.

## Read-only cost audit (OCI CLI)

```bash
TENANCY='<tenancy-ocid>'
INSTANCE='<instance-ocid>'

oci compute instance get --instance-id "$INSTANCE" \
  --query 'data.{state:"lifecycle-state",shape:shape,ocpus:"shape-config".ocpus,memoryGB:"shape-config"."memory-in-gbs"}' --output json

oci usage-api usage-summary request-summarized-usages \
  --tenant-id "$TENANCY" \
  --time-usage-started 2026-08-01T00:00:00Z \
  --time-usage-ended 2026-09-01T00:00:00Z \
  --granularity DAILY --is-aggregate-by-time true --query-type COST \
  --group-by '["service","skuName","resourceId"]' --output json

oci budgets budget budget list --compartment-id "$TENANCY" --all --output json
```

Interpret the `Compute / Standard - A1` and `Standard - A1 - Memory` rows plus `computed-amount`. Cost reporting can lag; do not promise future billing outcome solely from a current zero amount.

## Budget pitfall

An OCI Budget alert rule can be `ACTIVE` while `recipients` is empty. In that state it does not meaningfully notify the owner. Audit alert rules too:

```bash
oci budgets budget alert-rule list --budget-id '<budget-ocid>' --all --output json
```

Request explicit owner approval before adding/changing recipients.

## OCI serial-console recovery

- Public SSH timeout is a network-path problem; it is not evidence the key is wrong.
- OCI Instance Console Connection rejected an `ssh-ed25519` public key (`Invalid ssh public key type`). Use a **temporary RSA key** for this recovery path.
- Create via CLI only after user authorization:

```bash
ssh-keygen -t rsa -b 4096 -N '' -f /secure/path/oracle-console-rsa
oci compute instance-console-connection create \
  --instance-id '<instance-ocid>' \
  --ssh-public-key-file /secure/path/oracle-console-rsa.pub \
  --wait-for-state ACTIVE
```

Treat the generated console key as temporary and delete the OCI console connection plus local/downloaded private key after normal SSH is restored. Never paste a private key into chat; rotate any key exposed in chat.
