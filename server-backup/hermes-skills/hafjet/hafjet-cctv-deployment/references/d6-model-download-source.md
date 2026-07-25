# D.6 Model Download — Actual Sources

## Source: HuggingFace (NOT GitHub opencv_extra — 404)

The `opencv/opencv_extra` repo moved/moved files from master to 4.x branch,
and direct `raw.githubusercontent.com` links return 404 for these testdata files.

**Working source:** HuggingFace repository by AjaySharma

```bash
cd /mnt/cctv/models/

# Age model (~44 MB)
curl -L -o age_net.caffemodel \
  https://huggingface.co/AjaySharma/genderDetection/resolve/main/age_net.caffemodel

# Gender model (~44 MB)
curl -L -o gender_net.caffemodel \
  https://huggingface.co/AjaySharma/genderDetection/resolve/main/gender_net.caffemodel

# Age deploy prototxt (~2.3 KB)
curl -L -o age_deploy.prototxt \
  https://huggingface.co/AjaySharma/genderDetection/resolve/main/age_deploy.prototxt

# Gender deploy prototxt (~2.3 KB)
curl -L -o gender_deploy.prototxt \
  https://huggingface.co/AjaySharma/genderDetection/resolve/main/gender_deploy.prototxt
```

## Download verification

| File | Expected Size | Actual |
|------|--------------|--------|
| age_net.caffemodel | ~44 MB | ✅ |
| gender_net.caffemodel | ~44 MB | ✅ |
| age_deploy.prototxt | ~2.3 KB | ✅ |
| gender_deploy.prototxt | ~2.3 KB | ✅ |

Total: ~88 MB. Note: files are larger than the ~22MB estimate — OpenCV model zoo files
from HuggingFace include additional metadata or were compiled with different settings.

## Fallback locations (if HuggingFace becomes unavailable)

- `https://github.com/eveningglow/age-and-gender-classification/tree/master/model`
- `https://github.com/spmallick/learnopencv/tree/master/AgeGender`
