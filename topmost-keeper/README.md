# Topmost Keeper / 窗口永久置顶工具 / ウィンドウ常時最前面ツール

A lightweight Windows desktop tool made by Dan. Select a running window and keep it always on top.

Dan 制作的轻量 Windows 桌面工具。选择当前运行的窗口并持续固定在画面最上层。

Dan が制作した軽量 Windows デスクトップツールです。実行中のウィンドウを選択し、常に最前面に固定できます。

## Features / 功能 / 機能

- Chinese, Japanese, and English interface / 中日英界面 / 中国語・日本語・英語 UI
- Continuous always-on-top guard / 持续守护置顶状态 / 常時最前面の状態を継続監視
- Saved rules restored on launch / 下次启动自动恢复规则 / 次回起動時にルールを復元

## Usage / 使用方式 / 使用方法

1. Run `TopmostKeeper.exe`.
2. Select a window.
3. Click `Keep On Top`, `永久置顶`, or `常に最前面`.
4. To restore normal behavior, select the window and remove the pin.

Rules are saved in `%APPDATA%\TopmostKeeper\rules.json`.

## 构建

```powershell
dotnet publish .\TopmostKeeper.csproj -c Release -r win-x64 --self-contained true
```

## Author

Made by Dan.
