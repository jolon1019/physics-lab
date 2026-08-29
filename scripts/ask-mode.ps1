Add-Type -AssemblyName System.Windows.Forms
$msg = "选择运行方式：`n是 = 同步到 FRP（手机可访问，构建 dist + 后端 + 隧道）`n否 = 仅本地测试（Vite 热更新，电脑 localhost:5173）"
$r = [System.Windows.Forms.MessageBox]::Show($msg, "物理实验平台 - 启动", "YesNoCancel", "Question")
if ($r -eq "Yes") { exit 0 } else { exit 1 }
