from __future__ import annotations

import importlib
import os
import queue
import re
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Callable

import tkinter as tk
from tkinter import filedialog, messagebox, ttk


APP_DIR = Path(__file__).resolve().parent
VENDOR_DIR = APP_DIR / "vendor"
DEFAULT_DOWNLOAD_DIR = Path.home() / "Downloads" / "BilibiliDownloader"
BV_PATTERN = re.compile(r"(?i)\b(BV[0-9A-Za-z]{10})\b")
AV_PATTERN = re.compile(r"(?i)\bav(\d+)\b")
UI_TEXT = {
    "zh": {"app": "B 站视频下载器", "credit": "Dan 制作", "language": "语言", "url": "视频地址", "result": "识别结果", "options": "下载选项", "video": "下载视频", "audio": "仅下载音频", "save": "保存位置", "choose": "选择文件夹", "open": "打开文件夹", "log": "运行记录", "detect": "识别视频", "download": "开始下载"},
    "ja": {"app": "Bilibili 動画ダウンローダー", "credit": "Dan 制作", "language": "言語", "url": "動画 URL", "result": "解析結果", "options": "ダウンロード設定", "video": "動画をダウンロード", "audio": "音声のみ", "save": "保存先", "choose": "フォルダーを選択", "open": "フォルダーを開く", "log": "実行ログ", "detect": "動画を解析", "download": "ダウンロード開始"},
    "en": {"app": "Bilibili Video Downloader", "credit": "Made by Dan", "language": "Language", "url": "Video URL", "result": "Video details", "options": "Download options", "video": "Download video", "audio": "Audio only", "save": "Save location", "choose": "Choose folder", "open": "Open folder", "log": "Activity log", "detect": "Analyze video", "download": "Start download"},
}


def prepare_import_path() -> None:
    VENDOR_DIR.mkdir(exist_ok=True)
    vendor = str(VENDOR_DIR)
    if vendor not in sys.path:
        sys.path.insert(0, vendor)


def ensure_dependencies(status: Callable[[str], None] | None = None) -> None:
    prepare_import_path()
    try:
        importlib.import_module("yt_dlp")
        importlib.import_module("imageio_ffmpeg")
        return
    except ImportError:
        pass

    if status:
        status("首次启动：正在准备下载组件，请稍候...")
    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--target",
        str(VENDOR_DIR),
        "yt-dlp",
        "imageio-ffmpeg",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        details = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"无法安装下载组件。\n{details}")
    importlib.invalidate_caches()


def normalize_bilibili_input(raw_value: str) -> str:
    value = raw_value.strip()
    if not value:
        raise ValueError("请粘贴 B 站视频号或网址。")

    bv_match = BV_PATTERN.search(value)
    if bv_match:
        return f"https://www.bilibili.com/video/{bv_match.group(1)}"

    av_match = AV_PATTERN.search(value)
    if av_match:
        return f"https://www.bilibili.com/video/av{av_match.group(1)}"

    if value.isdigit():
        return f"https://www.bilibili.com/video/av{value}"

    raise ValueError("未识别到 B 站视频号。支持 BV 号、av 号或完整视频网址。")


def ffmpeg_path() -> str:
    imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
    return imageio_ffmpeg.get_ffmpeg_exe()


def safe_filename(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    return value[:150] or "bilibili_video"


def quality_label(fmt: dict[str, Any]) -> str:
    height = fmt.get("height") or 0
    width = fmt.get("width") or 0
    note = fmt.get("format_note") or ""
    codec = (fmt.get("vcodec") or "").split(".")[0]
    fps = fmt.get("fps") or 0
    size = fmt.get("filesize") or fmt.get("filesize_approx")
    size_text = f" · {size / 1024 / 1024:.1f} MB" if size else ""
    fps_text = f" · {fps:g}fps" if fps else ""
    note_text = f" · {note}" if note else ""
    return f"{height}P ({width}x{height}){fps_text} · {codec}{note_text}{size_text}"


def extract_video_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()
    for fmt in info.get("formats") or []:
        if fmt.get("vcodec") in (None, "none") or not fmt.get("height"):
            continue
        key = (int(fmt.get("height") or 0), str(fmt.get("format_id")))
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            {
                "format_id": str(fmt["format_id"]),
                "height": int(fmt.get("height") or 0),
                "width": int(fmt.get("width") or 0),
                "fps": fmt.get("fps"),
                "format_note": fmt.get("format_note"),
                "vcodec": fmt.get("vcodec"),
                "filesize": fmt.get("filesize"),
                "filesize_approx": fmt.get("filesize_approx"),
            }
        )
    return sorted(candidates, key=lambda item: (item["height"], item["format_id"]), reverse=True)


class BilibiliDownloaderApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("B 站视频下载器")
        self.geometry("820x650")
        self.minsize(760, 600)

        self.events: queue.Queue[tuple[str, Any]] = queue.Queue()
        self.detected_url = ""
        self.video_formats: list[dict[str, Any]] = []
        self.busy = False

        self.input_var = tk.StringVar()
        self.title_var = tk.StringVar(value="等待识别视频")
        self.meta_var = tk.StringVar(value="粘贴 BV 号、av 号或 B 站视频网址")
        self.download_mode = tk.StringVar(value="video")
        self.quality_var = tk.StringVar()
        self.audio_format_var = tk.StringVar(value="m4a")
        self.browser_cookie_var = tk.BooleanVar(value=False)
        self.output_dir_var = tk.StringVar(value=str(DEFAULT_DOWNLOAD_DIR))
        self.status_var = tk.StringVar(value="就绪")
        self.progress_var = tk.DoubleVar(value=0)
        self.language_var = tk.StringVar(value="zh")

        self._build_ui()
        self.after(100, self._process_events)

    def _build_ui(self) -> None:
        container = ttk.Frame(self, padding=20)
        container.pack(fill="both", expand=True)
        container.columnconfigure(0, weight=1)

        ttk.Label(container, text=self._t("app"), font=("Microsoft YaHei UI", 18, "bold")).grid(
            row=0, column=0, sticky="w"
        )
        language_frame = ttk.Frame(container)
        language_frame.grid(row=0, column=0, sticky="e")
        ttk.Label(language_frame, text=self._t("credit")).pack(side="left", padx=(0, 12))
        ttk.Label(language_frame, text=self._t("language")).pack(side="left", padx=(0, 5))
        language_combo = ttk.Combobox(language_frame, textvariable=self.language_var, values=("zh", "ja", "en"), state="readonly", width=5)
        language_combo.pack(side="left")
        language_combo.bind("<<ComboboxSelected>>", self._change_language)
        ttk.Label(
            container,
            text="用于下载你有权保存的视频。登录凭证只从本机浏览器读取，不会上传。",
            foreground="#555555",
        ).grid(row=1, column=0, sticky="w", pady=(4, 18))

        input_frame = ttk.LabelFrame(container, text=self._t("url"), padding=12)
        input_frame.grid(row=2, column=0, sticky="ew")
        input_frame.columnconfigure(0, weight=1)
        self.input_entry = ttk.Entry(input_frame, textvariable=self.input_var)
        self.input_entry.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self.input_entry.bind("<Return>", lambda _event: self.detect_video())
        self.detect_button = ttk.Button(input_frame, text=self._t("detect"), command=self.detect_video)
        self.detect_button.grid(row=0, column=1)

        info_frame = ttk.LabelFrame(container, text=self._t("result"), padding=12)
        info_frame.grid(row=3, column=0, sticky="ew", pady=(14, 0))
        info_frame.columnconfigure(0, weight=1)
        ttk.Label(info_frame, textvariable=self.title_var, font=("Microsoft YaHei UI", 11, "bold"), wraplength=740).grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(info_frame, textvariable=self.meta_var, foreground="#555555").grid(
            row=1, column=0, sticky="w", pady=(6, 0)
        )

        options_frame = ttk.LabelFrame(container, text=self._t("options"), padding=12)
        options_frame.grid(row=4, column=0, sticky="ew", pady=(14, 0))
        options_frame.columnconfigure(1, weight=1)

        ttk.Radiobutton(
            options_frame, text=self._t("video"), variable=self.download_mode, value="video", command=self._sync_controls
        ).grid(row=0, column=0, sticky="w")
        self.quality_combo = ttk.Combobox(options_frame, textvariable=self.quality_var, state="readonly")
        self.quality_combo.grid(row=0, column=1, sticky="ew", padx=(16, 0))

        ttk.Radiobutton(
            options_frame, text=self._t("audio"), variable=self.download_mode, value="audio", command=self._sync_controls
        ).grid(row=1, column=0, sticky="w", pady=(10, 0))
        self.audio_combo = ttk.Combobox(
            options_frame, textvariable=self.audio_format_var, values=("m4a", "mp3"), state="readonly", width=10
        )
        self.audio_combo.grid(row=1, column=1, sticky="w", padx=(16, 0), pady=(10, 0))

        self.cookie_checkbox = ttk.Checkbutton(
            options_frame,
            text="使用本机 Chrome 登录状态（会员画质或登录后可见视频）",
            variable=self.browser_cookie_var,
        )
        self.cookie_checkbox.grid(row=2, column=0, columnspan=2, sticky="w", pady=(14, 0))

        output_frame = ttk.LabelFrame(container, text=self._t("save"), padding=12)
        output_frame.grid(row=5, column=0, sticky="ew", pady=(14, 0))
        output_frame.columnconfigure(0, weight=1)
        ttk.Entry(output_frame, textvariable=self.output_dir_var).grid(row=0, column=0, sticky="ew", padx=(0, 8))
        ttk.Button(output_frame, text=self._t("choose"), command=self.choose_output_dir).grid(row=0, column=1, padx=(0, 8))
        ttk.Button(output_frame, text=self._t("open"), command=self.open_output_dir).grid(row=0, column=2)

        action_frame = ttk.Frame(container)
        action_frame.grid(row=6, column=0, sticky="ew", pady=(18, 0))
        action_frame.columnconfigure(0, weight=1)
        self.progress = ttk.Progressbar(action_frame, variable=self.progress_var, maximum=100)
        self.progress.grid(row=0, column=0, sticky="ew", padx=(0, 12))
        self.download_button = ttk.Button(action_frame, text=self._t("download"), command=self.download, state="disabled")
        self.download_button.grid(row=0, column=1)

        ttk.Label(container, textvariable=self.status_var, foreground="#333333", wraplength=760).grid(
            row=7, column=0, sticky="w", pady=(10, 0)
        )

        log_frame = ttk.LabelFrame(container, text=self._t("log"), padding=8)
        log_frame.grid(row=8, column=0, sticky="nsew", pady=(14, 0))
        container.rowconfigure(8, weight=1)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        self.log_text = tk.Text(log_frame, height=9, wrap="word", state="disabled", font=("Consolas", 9))
        self.log_text.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=scrollbar.set)

        self._sync_controls()
        self.input_entry.focus_set()

    def _t(self, key: str) -> str:
        return UI_TEXT[self.language_var.get()][key]

    def _change_language(self, _event: object = None) -> None:
        self.title(self._t("app"))
        for child in self.winfo_children():
            child.destroy()
        self._build_ui()

    def _sync_controls(self) -> None:
        is_video = self.download_mode.get() == "video"
        self.quality_combo.configure(state="readonly" if is_video and self.video_formats else "disabled")
        self.audio_combo.configure(state="readonly" if not is_video else "disabled")

    def _post(self, event: str, value: Any = None) -> None:
        self.events.put((event, value))

    def _log(self, message: str) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message.rstrip() + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _process_events(self) -> None:
        try:
            while True:
                event, value = self.events.get_nowait()
                if event == "status":
                    self.status_var.set(str(value))
                elif event == "log":
                    self._log(str(value))
                elif event == "progress":
                    self.progress_var.set(float(value))
                elif event == "detected":
                    self._show_detected(value)
                elif event == "done":
                    self._finish_busy()
                    self.progress_var.set(100)
                    self.status_var.set(f"下载完成：{value}")
                    self._log(f"下载完成：{value}")
                    messagebox.showinfo("下载完成", f"文件已保存到：\n{value}")
                elif event == "error":
                    self._finish_busy()
                    self.status_var.set("操作失败")
                    self._log(str(value))
                    messagebox.showerror("操作失败", str(value))
        except queue.Empty:
            pass
        self.after(100, self._process_events)

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        self.detect_button.configure(state="disabled" if busy else "normal")
        self.download_button.configure(state="disabled" if busy or not self.detected_url else "normal")
        if busy:
            self.progress_var.set(0)

    def _finish_busy(self) -> None:
        self._set_busy(False)

    def choose_output_dir(self) -> None:
        selected = filedialog.askdirectory(initialdir=self.output_dir_var.get())
        if selected:
            self.output_dir_var.set(selected)

    def open_output_dir(self) -> None:
        path = Path(self.output_dir_var.get()).expanduser()
        path.mkdir(parents=True, exist_ok=True)
        os.startfile(path)  # type: ignore[attr-defined]

    def detect_video(self) -> None:
        if self.busy:
            return
        try:
            normalized = normalize_bilibili_input(self.input_var.get())
        except ValueError as exc:
            messagebox.showwarning("无法识别", str(exc))
            return
        self.input_var.set(normalized)
        use_cookies = self.browser_cookie_var.get()
        self._set_busy(True)
        self.status_var.set("正在识别视频...")
        self._log(f"识别：{normalized}")
        threading.Thread(target=self._detect_worker, args=(normalized, use_cookies), daemon=True).start()

    def _detect_worker(self, url: str, use_cookies: bool) -> None:
        try:
            ensure_dependencies(lambda message: self._post("status", message))
            yt_dlp = importlib.import_module("yt_dlp")
            options: dict[str, Any] = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "ffmpeg_location": ffmpeg_path(),
            }
            if use_cookies:
                options["cookiesfrombrowser"] = ("chrome",)
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=False)
            self._post("detected", {"url": url, "info": info, "formats": extract_video_formats(info)})
        except Exception as exc:
            self._post("error", self._friendly_error(exc))

    def _show_detected(self, result: dict[str, Any]) -> None:
        info = result["info"]
        self.detected_url = result["url"]
        self.video_formats = result["formats"]
        labels = [quality_label(fmt) for fmt in self.video_formats]
        self.quality_combo.configure(values=labels)
        if labels:
            self.quality_var.set(labels[0])
        duration = int(info.get("duration") or 0)
        minute, second = divmod(duration, 60)
        self.title_var.set(info.get("title") or "未命名视频")
        self.meta_var.set(f"视频号：{info.get('id', '-')}    时长：{minute}:{second:02d}    可用视频格式：{len(labels)} 个")
        self.status_var.set("识别完成，请选择下载方式。")
        self._log(f"识别完成：{info.get('title', '未命名视频')}")
        self._finish_busy()
        self._sync_controls()

    def download(self) -> None:
        if self.busy or not self.detected_url:
            return
        output_dir = Path(self.output_dir_var.get()).expanduser()
        mode = self.download_mode.get()
        selected_index = self.quality_combo.current()
        selected_format = self.video_formats[selected_index] if mode == "video" and selected_index >= 0 else None
        audio_format = self.audio_format_var.get()
        use_cookies = self.browser_cookie_var.get()
        self._set_busy(True)
        self.status_var.set("正在下载...")
        threading.Thread(
            target=self._download_worker,
            args=(self.detected_url, output_dir, mode, selected_format, audio_format, use_cookies),
            daemon=True,
        ).start()

    def _download_worker(
        self,
        url: str,
        output_dir: Path,
        mode: str,
        selected_format: dict[str, Any] | None,
        audio_format: str,
        use_cookies: bool,
    ) -> None:
        try:
            ensure_dependencies(lambda message: self._post("status", message))
            yt_dlp = importlib.import_module("yt_dlp")
            output_dir.mkdir(parents=True, exist_ok=True)
            before = {path.resolve() for path in output_dir.glob("*") if path.is_file()}

            def progress_hook(data: dict[str, Any]) -> None:
                if data.get("status") == "downloading":
                    total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
                    downloaded = data.get("downloaded_bytes") or 0
                    if total:
                        self._post("progress", downloaded / total * 100)
                    speed = data.get("_speed_str", "").strip()
                    percent = data.get("_percent_str", "").strip()
                    self._post("status", f"正在下载 {percent} {speed}".strip())
                elif data.get("status") == "finished":
                    self._post("status", "下载完成，正在处理文件...")

            options: dict[str, Any] = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "ffmpeg_location": ffmpeg_path(),
                "windowsfilenames": True,
                "outtmpl": str(output_dir / "%(title).150s [%(id)s].%(ext)s"),
                "progress_hooks": [progress_hook],
            }
            if use_cookies:
                options["cookiesfrombrowser"] = ("chrome",)

            if mode == "video":
                if not selected_format:
                    raise RuntimeError("请先选择视频画质。")
                options["format"] = f"{selected_format['format_id']}+bestaudio/best"
                options["merge_output_format"] = "mp4"
            else:
                options["format"] = "bestaudio/best"
                if audio_format == "mp3":
                    options["postprocessors"] = [
                        {
                            "key": "FFmpegExtractAudio",
                            "preferredcodec": "mp3",
                            "preferredquality": "192",
                        }
                    ]

            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=True)

            after = {path.resolve() for path in output_dir.glob("*") if path.is_file()}
            created = sorted(after - before, key=lambda path: path.stat().st_mtime, reverse=True)
            if created:
                final_path = created[0]
            else:
                prepared = Path(ydl.prepare_filename(info))
                final_path = prepared.with_suffix(".mp3") if mode == "audio" and audio_format == "mp3" else prepared
            self._post("done", str(final_path))
        except Exception as exc:
            self._post("error", self._friendly_error(exc))

    @staticmethod
    def _friendly_error(exc: Exception) -> str:
        text = str(exc)
        lowered = text.lower()
        if "could not copy chrome cookie database" in lowered or "permission" in lowered and "cookie" in lowered:
            return "无法读取 Chrome 登录状态。请完全退出 Chrome 后重试，或取消勾选登录状态下载公开画质。"
        if "premium member" in lowered:
            return "所选画质需要对应会员权限。请确认 Chrome 已登录具备权限的 B 站账号，并重新识别视频。"
        if "unsupported url" in lowered:
            return "该地址暂不受支持。请粘贴 B 站视频页网址、BV 号或 av 号。"
        return text


def main() -> None:
    app = BilibiliDownloaderApp()
    app.mainloop()


if __name__ == "__main__":
    main()
