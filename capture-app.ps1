# Capture SYNCERA window contents using PrintWindow API
# Works even if window is on second monitor or behind other windows
Add-Type -AssemblyName "System.Drawing"

$sig = @"
[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
[DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
[DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
"@
Add-Type -MemberDefinition $sig -Name "U32" -Namespace "Win32" -PassThru | Out-Null

# Find all SYNCERA windows
$candidates = @()
$proc = {
  param($hWnd, $lp)
  if ([Win32.U32]::IsWindowVisible($hWnd)) {
    $sb = New-Object System.Text.StringBuilder 256
    [Win32.U32]::GetWindowText($hWnd, $sb, 256) | Out-Null
    $title = $sb.ToString()
    if ($title -match "SYNCERA" -and $title -notmatch "Word" -and $title -notmatch "\.docx") {
      $rect = New-Object Win32.U32+RECT
      [Win32.U32]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
      $w = $rect.Right - $rect.Left
      $h = $rect.Bottom - $rect.Top
      $script:candidates += [PSCustomObject]@{ hWnd = $hWnd; Title = $title; W = $w; H = $h; Rect = $rect }
    }
  }
  return $true
}
[Win32.U32]::EnumWindows($proc, [IntPtr]::Zero) | Out-Null

if ($candidates.Count -eq 0) {
  Write-Host "No SYNCERA window found"
  exit 1
}

Write-Host "Found $($candidates.Count) SYNCERA window(s):"
$candidates | ForEach-Object { Write-Host "  - hWnd=$($_.hWnd) '$($_.Title)' size=$($_.W)x$($_.H)" }

# Pick the largest (main window)
$target = $candidates | Sort-Object { $_.W * $_.H } -Descending | Select-Object -First 1
Write-Host "`nCapturing: $($target.Title) ($($target.W)x$($target.H))"

if ($target.W -le 0 -or $target.H -le 0) {
  Write-Host "Invalid size"
  exit 1
}

# PrintWindow: captures window content directly via WM_PRINT — works for occluded/off-screen windows
$bmp = New-Object System.Drawing.Bitmap $target.W, $target.H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()

# PW_RENDERFULLCONTENT = 0x00000002 — includes layered windows (important for Electron)
$success = [Win32.U32]::PrintWindow($target.hWnd, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()

if (-not $success) {
  Write-Host "PrintWindow failed, trying flags=0..."
  $bmp.Dispose()
  $bmp = New-Object System.Drawing.Bitmap $target.W, $target.H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  [Win32.U32]::PrintWindow($target.hWnd, $hdc, 0) | Out-Null
  $g.ReleaseHdc($hdc)
  $g.Dispose()
}

$output = ".\docs\screenshots\syncera-main.png"
$dir = [System.IO.Path]::GetDirectoryName($output)
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Saved: $output"
