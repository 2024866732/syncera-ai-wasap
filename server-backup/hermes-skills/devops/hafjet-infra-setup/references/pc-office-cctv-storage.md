# PC Office: Adding a Logical Volume for CCTV Data

## Context
The PC Office (hafjet-pc-office) has a 512 GB SSD (sda) with LVM. The root LV (ubuntu‑vg‑ubuntu--lv) uses ~100 GB, leaving ~374 GB free in the VG. This note shows how to create a new LV for CCTV/AI data and mount it at /mnt/cctv.

## Commands run (as hafizi145, with sudo where needed)

### 1. Check VG free space
```bash
sudo vgdisplay
```
Output (trimmed):
```
VG Name               ubuntu-vg
VG Size               474.93 GiB
Free  PE / Size       95983 / 374.93 GiB
```

### 2. Create new LV using all free space
```bash
sudo lvcreate -n cctv-lv -l 100%FREE ubuntu-vg
```
Output:
```
Logical volume "cctv-lv" created.
```

### 3. Format the LV as ext4 with label
```bash
sudo mkfs.ext4 -L CCTV_SSD /dev/ubuntu-vg/cctv-lv
```
Output (trimmed):
```
mke2fs 1.47.2 (1-Jan-2025)
Discarding device blocks: done                            
Creating filesystem with 98286592 4k blocks and 24576000 inodes
Filesystem UUID: da1cce88-4123-4b31-96ef-f2aa0aa1f18c
...
```

### 4. Create mount point
```bash
sudo mkdir -p /mnt/cctv
```

### 5. Get UUID for fstab
```bash
blkid /dev/ubuntu-vg/cctv-lv
```
Output:
```
/dev/ubuntu-vg/cctv-lv: LABEL="CCTV_SSD" UUID="da1cce88-4123-4b31-96ef-f2aa0aa1f18c" BLOCK_SIZE="4096" TYPE="ext4"
```

### 6. Add entry to /etc/fstab
```bash
sudo bash -c 'echo "UUID=da1cce88-4123-4b31-96ef-f2aa0aa1f18c  /mnt/cctv  ext4  defaults,noatime  0  2" >> /etc/fstab'
```

### 7. Mount the new volume
```bash
sudo mount -a
```

### 8. Verify mount
```bash
df -hT | grep /mnt/cctv
```
Output:
```
/dev/mapper/ubuntu--vg-cctv-lv  ext4   368G   72M  348G   1% /mnt/cctv
```

### 9. Set ownership (optional but recommended)
```bash
sudo chown -R $USER:$USER /mnt/cctv
```

### 10. Create directory structure for CCTV‑AI
```bash
mkdir -p /mnt/cctv/{raw,annotated,models,logs,backup}
```

## Notes
- Always double‑check the LV name (`/dev/ubuntu-vg/cctv-lv`) before running `mkfs` or `lvremove`.
- If you prefer to extend the existing root LV instead, use `lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu--lv` followed by `resize2fs /dev/ubuntu-vg/ubuntu--lv`.
- The steps above assume ext4; for XFS replace `mkfs.ext4` with `mkfs.xfs` and adjust fstab type accordingly.