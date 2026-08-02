# UpCloud Trial Benchmarks — August 2026

## Server: 2xCPU-4GB, Singapore (sg-sin1)
- CPU: AMD EPYC 9575F (2 cores)
- RAM: 3.8GB (0 swap!)
- Disk: 80GB MaxIOPS (69GB free)
- OS: Ubuntu 26.04 LTS

## CPU Stress (stress-ng, 30s)
- 2 cores: ALL PASS
- No throttling detected

## Memory Stress (stress-ng, 30s)
- 2 VMs × 1.8GB = 3.6GB allocated
- No OOM, no swap
- Passed cleanly

## Disk I/O (fio, 30s)

### Sequential 128K (1 job, QD=16)
- READ: 23.4 MB/s
- WRITE: 43.0 MB/s

### Random 4K Mixed R/W (70/30, 4 jobs, QD=64)
- **READ: 512 MB/s** (537 MB/s)
- Latency: avg 59µs

### Random 4K Read IOPS (4 jobs, QD=128)
- **READ: 4.8 GB/s** (5117 MB/s)
- This is the peak IOPS throughput — MaxIOPS storage shines here

## Network
- iperf3 to he.net: timeout (common SG→US route)
- Public IP: 213.163.192.164

## Services Installed (cloud-init)
- Docker 29.7.1 ✅
- k3s v1.36.2+k3s1 ✅
- stress-ng 0.20.01 ✅
- fio ✅
- iperf3 ✅
- hey (HTTP load tester) ✅

## Comparison vs Azure B1s
| Metric | Azure B1s (current) | UpCloud Trial |
|--------|---------------------|---------------|
| CPU | 1 vCPU Intel | 2 vCPU AMD EPYC |
| RAM | 848Mi (1GB) | 3.8GB (4GB) |
| Swap | 1.6GB used | 0 bytes |
| Disk | 29GB HDD | 80GB MaxIOPS |
| Disk Write | N/A | 43 MB/s |
| Network | Azure internal | Public 213.x |

## Takeaway
UpCloud 2C/4GB is **4x more RAM** and **2x more CPU** than Azure B1s.
Disk I/O is cloud-tier (43 MB/s write is solid).
Zero swap = much better for Hermes agent (currently 304Mi RSS, fits easily).
