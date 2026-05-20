# Capture all SYNCERA sections by clicking each LeftNav button
Add-Type -AssemblyName "System.Drawing"
Add-Type -AssemblyName "System.Windows.Forms"

$sig = @"
[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
[DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
"@
Add-Type -MemberDefinition $sig -Name "U32" -Namespace "Win32" -PassThru | Out-Null

# Find SYNCERA window
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
      $script:candidates += [PSCustomObject]@{
        hWnd = $hWnd; Title = $title;
        Rect = $rect;
        W = $rect.Right - $rect.Left;
        H = $rect.Bottom - $rect.Top
      }
    }
  }
  return $true
}
[Win32.U32]::EnumWindows($proc, [IntPtr]::Zero) | Out-Null
$target = $candidates | Sort-Object { $_.W * $_.H } -Descending | Select-Object -First 1
if (-not $target) { Write-Host "No SYNCERA window"; exit 1 }

Write-Host "Window: $($target.W)x$($target.H) at ($($target.Rect.Left),$($target.Rect.Top))"

# Bring forward
[Win32.U32]::ShowWindowAsync($target.hWnd, 9) | Out-Null
[Win32.U32]::SetForegroundWindow($target.hWnd) | Out-Null
Start-Sleep -Milliseconds 1500

$outDir = ".\docs\screenshots"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# LeftNav button layout — window-relative coords
# TitleBar is 40px tall. LeftNav starts at y=40 in content area.
# Each button ~44px tall, starts ~16px below TitleBar
# Button center X = LeftNav width (68) / 2 = ~34
# LeftNav layout from code: titlebar 40px, py-4 (16px), buttons w-11 h-11 (44px), gap-1 (4px)
# So center of first button = 40 + 16 + 22 = 78; gap between centers = 44 + 4 = 48
$navButtonX = 34
$navStartY = 78
$buttonGap = 48

# Sections in NAV order (from LeftNav.tsx)
$sections = @(
  @{ key = "chats";     idx = 0  },
  @{ key = "quicksend"; idx = 1  },
  @{ key = "dashboard"; idx = 2  },
  @{ key = "pipeline";  idx = 3  },
  @{ key = "broadcast"; idx = 4  },
  @{ key = "templates"; idx = 5  },
  @{ key = "orders";    idx = 6  },
  @{ key = "reminders"; idx = 7  },
  @{ key = "analytics"; idx = 8  },
  @{ key = "reports";   idx = 9  },
  @{ key = "insights";  idx = 10 }
)

function Capture-Window {
  param($hWnd, $W, $H, $path)
  $bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  [Win32.U32]::PrintWindow($hWnd, $hdc, 2) | Out-Null
  $g.ReleaseHdc($hdc); $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Click-At {
  param($absX, $absY)
  [Win32.U32]::SetCursorPos($absX, $absY) | Out-Null
  Start-Sleep -Milliseconds 100
  # LEFTDOWN=0x02, LEFTUP=0x04
  [Win32.U32]::mouse_event(0x02, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [Win32.U32]::mouse_event(0x04, 0, 0, 0, [IntPtr]::Zero)
}

foreach ($s in $sections) {
  $absX = $target.Rect.Left + $navButtonX
  $absY = $target.Rect.Top + $navStartY + ($s.idx * $buttonGap)
  Write-Host "-> Click section '$($s.key)' at abs ($absX, $absY)"
  Click-At $absX $absY
  Start-Sleep -Milliseconds 1400  # wait for section to render

  $out = Join-Path $outDir ("syncera-$($s.key).png")
  Capture-Window $target.hWnd $target.W $target.H $out
  $size = (Get-Item $out).Length
  Write-Host "   OK Saved $($s.key).png ($([math]::Round($size/1024)) KB)"
}

# Bonus: click back to chats
$absX = $target.Rect.Left + $navButtonX
$absY = $target.Rect.Top + $navStartY
Click-At $absX $absY
Start-Sleep -Milliseconds 600

Write-Host "`nOK Done. Screenshots in $outDir"
