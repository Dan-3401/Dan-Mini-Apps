from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import wave
from array import array
from pathlib import Path
from tkinter import BooleanVar, StringVar, Tk, filedialog, messagebox
from tkinter import ttk
from tkinter import Canvas


APP_NAME = "QuickClip - RVC 快速剪辑"
UI_TEXT = {
    "zh": {"credit": "Dan 制作", "language": "语言", "open": "打开音频 / 视频", "export": "导出当前选区", "folder": "打开输出目录", "clear": "清除选区", "auto": "松开鼠标立即导出", "rvc": "输出 RVC 训练用 WAV（单声道、40 kHz、16-bit）", "help": "操作：将音频或视频拖入窗口，然后按住鼠标拖动时间轴选择片段。"},
    "ja": {"credit": "Dan 制作", "language": "言語", "open": "音声 / 動画を開く", "export": "選択範囲を書き出す", "folder": "出力フォルダーを開く", "clear": "選択を解除", "auto": "マウスを離したらすぐ書き出す", "rvc": "RVC 学習用 WAV を出力（モノラル、40 kHz、16-bit）", "help": "操作：音声または動画をドロップし、タイムラインをドラッグして範囲を選択します。"},
    "en": {"credit": "Made by Dan", "language": "Language", "open": "Open audio / video", "export": "Export selection", "folder": "Open output folder", "clear": "Clear selection", "auto": "Export when mouse is released", "rvc": "Export RVC training WAV (mono, 40 kHz, 16-bit)", "help": "Drop audio or video into the window, then drag on the timeline to select a clip."},
}
MEDIA_TYPES = [
    ("音频和视频", "*.wav *.mp3 *.flac *.m4a *.aac *.ogg *.mp4 *.mkv *.mov *.avi *.webm"),
    ("所有文件", "*.*"),
]
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
MEDIA_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".flac",
    ".m4a",
    ".aac",
    ".ogg",
    ".mp4",
    ".mkv",
    ".mov",
    ".avi",
    ".webm",
    ".m4v",
}


def app_dir() -> Path:
    return Path(__file__).resolve().parent


def find_tool(name: str) -> str:
    local = app_dir() / "bin" / f"{name}.exe"
    if local.exists():
        return str(local)
    rvc = Path(r"D:\Codex\RVC1006Nvidia") / f"{name}.exe"
    if rvc.exists():
        return str(rvc)
    found = shutil.which(name)
    if found:
        return found
    raise FileNotFoundError(f"找不到 {name}。请将 {name}.exe 放入 QuickClip\\bin。")


def run_hidden(command: list[str], **kwargs) -> subprocess.CompletedProcess:
    startupinfo = None
    creationflags = 0
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        creationflags = subprocess.CREATE_NO_WINDOW
    return subprocess.run(
        command,
        startupinfo=startupinfo,
        creationflags=creationflags,
        **kwargs,
    )


def probe_duration(path: Path) -> float:
    result = run_hidden(
        [
            find_tool("ffprobe"),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    value = json.loads(result.stdout)["format"]["duration"]
    return float(value)


def decode_waveform(path: Path, points: int = 1400) -> list[float]:
    duration = probe_duration(path)
    sample_rate = max(60, min(400, math.ceil(points / max(duration, 1.0))))
    result = run_hidden(
        [
            find_tool("ffmpeg"),
            "-v",
            "error",
            "-i",
            str(path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-f",
            "s16le",
            "-",
        ],
        capture_output=True,
        check=True,
    )
    samples = array("h")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return []
    stride = max(1, math.ceil(len(samples) / points))
    output = []
    for start in range(0, len(samples), stride):
        chunk = samples[start : start + stride]
        output.append(max(abs(value) for value in chunk) / 32768.0)
    return output[:points]


def format_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes, remain = divmod(seconds, 60)
    return f"{int(minutes):02d}:{remain:05.2f}"


def unique_output(input_path: Path, output_dir: Path, start: float, end: float, mode: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = f"{int(start * 1000):08d}-{int(end * 1000):08d}"
    if mode == "rvc_wav":
        extension = ".wav"
    else:
        extension = input_path.suffix.lower() or ".mp4"
    base = output_dir / f"{input_path.stem}_{stamp}{extension}"
    if not base.exists():
        return base
    index = 2
    while True:
        candidate = output_dir / f"{input_path.stem}_{stamp}_{index}{extension}"
        if not candidate.exists():
            return candidate
        index += 1


def trim_media(
    input_path: Path,
    output_dir: Path,
    start: float,
    end: float,
    mode: str,
) -> Path:
    if end - start < 0.05:
        raise ValueError("选区太短，请至少选择 0.05 秒。")
    output = unique_output(input_path, output_dir, start, end, mode)
    duration = end - start
    command = [
        find_tool("ffmpeg"),
        "-y",
        "-v",
        "error",
        "-ss",
        f"{start:.6f}",
        "-i",
        str(input_path),
        "-t",
        f"{duration:.6f}",
    ]
    if mode == "rvc_wav":
        command += ["-vn", "-ac", "1", "-ar", "40000", "-c:a", "pcm_s16le"]
    else:
        command += ["-c", "copy"]
    command.append(str(output))
    result = run_hidden(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "FFmpeg 导出失败。")
    return output


class QuickClip:
    def __init__(self, root: Tk):
        self.root = root
        self.root.title(APP_NAME)
        self.root.geometry("980x620")
        self.root.minsize(760, 480)

        self.input_path: Path | None = None
        self.duration = 0.0
        self.waveform: list[float] = []
        self.selection_start = 0.0
        self.selection_end = 0.0
        self.drag_anchor_x: float | None = None
        self.loading = False
        self.exporting = False

        self.file_text = StringVar(value="尚未打开文件")
        self.selection_text = StringVar(value="选区：--")
        self.status_text = StringVar(value="打开文件后，在时间轴上按住鼠标拖动选区。")
        self.auto_export = BooleanVar(value=True)
        self.rvc_wav = BooleanVar(value=True)
        self.output_text = StringVar(value="")
        self.language_var = StringVar(value="zh")
        self.drop_target = None

        self._build_ui()
        self.enable_file_drop()
        self.root.bind("<Configure>", lambda _event: self.root.after_idle(self.draw_timeline))

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=14)
        frame.pack(fill="both", expand=True)

        toolbar = ttk.Frame(frame)
        toolbar.pack(fill="x")
        ttk.Button(toolbar, text=self._t("open"), command=self.choose_file).pack(side="left")
        ttk.Button(toolbar, text=self._t("export"), command=self.export_selection).pack(side="left", padx=(8, 0))
        ttk.Button(toolbar, text=self._t("folder"), command=self.open_output_dir).pack(side="left", padx=(8, 0))
        ttk.Button(toolbar, text=self._t("clear"), command=self.clear_selection).pack(side="left", padx=(8, 0))
        language_combo = ttk.Combobox(toolbar, textvariable=self.language_var, values=("zh", "ja", "en"), state="readonly", width=5)
        language_combo.pack(side="right")
        language_combo.bind("<<ComboboxSelected>>", self._change_language)
        ttk.Label(toolbar, text=self._t("language")).pack(side="right", padx=(0, 5))
        ttk.Label(toolbar, text=self._t("credit")).pack(side="right", padx=(0, 12))

        ttk.Checkbutton(
            frame,
            text=self._t("auto"),
            variable=self.auto_export,
        ).pack(anchor="w", pady=(14, 2))
        ttk.Checkbutton(
            frame,
            text=self._t("rvc"),
            variable=self.rvc_wav,
        ).pack(anchor="w")

        ttk.Label(frame, textvariable=self.file_text).pack(anchor="w", pady=(14, 4))
        ttk.Label(frame, textvariable=self.selection_text, font=("Segoe UI", 11, "bold")).pack(anchor="w")

        self.canvas = Canvas(frame, bg="#151922", highlightthickness=1, highlightbackground="#384050")
        self.canvas.pack(fill="both", expand=True, pady=(12, 8))
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)

        ttk.Label(
            frame,
            text=self._t("help"),
        ).pack(anchor="w")
        ttk.Label(frame, textvariable=self.status_text, foreground="#176b2c").pack(anchor="w", pady=(6, 0))

    def _t(self, key: str) -> str:
        return UI_TEXT[self.language_var.get()][key]

    def _change_language(self, _event: object = None) -> None:
        for child in self.root.winfo_children():
            child.destroy()
        self._build_ui()

    def choose_file(self) -> None:
        selected = filedialog.askopenfilename(title="选择音频或视频", filetypes=MEDIA_TYPES)
        if selected:
            self.load_file(Path(selected))

    def enable_file_drop(self) -> None:
        if os.name != "nt":
            return
        try:
            self.drop_target = WindowsDropTarget(self.root, self.handle_dropped_files)
        except Exception as error:
            self.status_text.set(f"拖放初始化失败，仍可点击打开文件：{error}")

    def handle_dropped_files(self, paths: list[Path]) -> None:
        media_paths = [path for path in paths if path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS]
        if not media_paths:
            messagebox.showinfo(APP_NAME, "请拖入常见格式的音频或视频文件。")
            return
        if len(media_paths) > 1:
            self.status_text.set(f"拖入了 {len(media_paths)} 个媒体文件，已载入第一个。")
        self.load_file(media_paths[0])

    def load_file(self, path: Path) -> None:
        if self.loading:
            return
        self.loading = True
        self.input_path = path
        self.file_text.set(f"文件：{path}")
        self.status_text.set("正在读取媒体信息和波形...")
        self.waveform = []
        self.clear_selection()
        threading.Thread(target=self._load_worker, args=(path,), daemon=True).start()

    def _load_worker(self, path: Path) -> None:
        try:
            duration = probe_duration(path)
            waveform = decode_waveform(path)
        except Exception as error:
            self.root.after(0, lambda: self._load_failed(error))
            return
        self.root.after(0, lambda: self._load_finished(duration, waveform))

    def _load_finished(self, duration: float, waveform: list[float]) -> None:
        self.duration = duration
        self.waveform = waveform
        self.loading = False
        self.status_text.set(f"已载入，总时长 {format_time(duration)}。拖动时间轴即可剪辑。")
        self.draw_timeline()

    def _load_failed(self, error: Exception) -> None:
        self.loading = False
        self.status_text.set("读取失败。")
        messagebox.showerror(APP_NAME, str(error))

    def x_to_time(self, x: float) -> float:
        width = max(1, self.canvas.winfo_width())
        return max(0.0, min(self.duration, self.duration * x / width))

    def time_to_x(self, seconds: float) -> float:
        width = max(1, self.canvas.winfo_width())
        return width * seconds / max(self.duration, 0.001)

    def on_press(self, event) -> None:
        if not self.input_path or self.duration <= 0:
            return
        self.drag_anchor_x = event.x
        self.selection_start = self.x_to_time(event.x)
        self.selection_end = self.selection_start
        self.draw_timeline()

    def on_drag(self, event) -> None:
        if self.drag_anchor_x is None:
            return
        first = self.x_to_time(self.drag_anchor_x)
        second = self.x_to_time(event.x)
        self.selection_start, self.selection_end = sorted((first, second))
        self.update_selection_text()
        self.draw_timeline()

    def on_release(self, event) -> None:
        if self.drag_anchor_x is None:
            return
        self.on_drag(event)
        self.drag_anchor_x = None
        if self.auto_export.get() and self.selection_end - self.selection_start >= 0.05:
            self.export_selection()

    def clear_selection(self) -> None:
        self.selection_start = 0.0
        self.selection_end = 0.0
        self.selection_text.set("选区：--")
        self.draw_timeline()

    def update_selection_text(self) -> None:
        length = self.selection_end - self.selection_start
        self.selection_text.set(
            f"选区：{format_time(self.selection_start)} → {format_time(self.selection_end)}"
            f"    长度 {length:.2f} 秒"
        )

    def draw_timeline(self) -> None:
        if not hasattr(self, "canvas"):
            return
        self.canvas.delete("all")
        width = max(1, self.canvas.winfo_width())
        height = max(1, self.canvas.winfo_height())
        center = height / 2

        self.canvas.create_line(0, center, width, center, fill="#5b6578")
        if self.waveform:
            step = width / max(1, len(self.waveform) - 1)
            scale = max(16, height * 0.42)
            for index, level in enumerate(self.waveform):
                x = index * step
                amplitude = max(1, level * scale)
                self.canvas.create_line(x, center - amplitude, x, center + amplitude, fill="#8aa4c7")

        if self.selection_end > self.selection_start:
            left = self.time_to_x(self.selection_start)
            right = self.time_to_x(self.selection_end)
            self.canvas.create_rectangle(left, 0, right, height, fill="#2878c8", stipple="gray50", outline="#73b8ff", width=2)

        if self.duration > 0:
            labels = 8
            for index in range(labels + 1):
                x = width * index / labels
                seconds = self.duration * index / labels
                self.canvas.create_line(x, height - 18, x, height, fill="#5b6578")
                self.canvas.create_text(x + 3, height - 20, text=format_time(seconds), fill="#e3e7ef", anchor="sw")

    def output_dir(self) -> Path:
        if not self.input_path:
            return app_dir() / "clips"
        return self.input_path.parent / "QuickClip_剪辑结果"

    def open_output_dir(self) -> None:
        output = self.output_dir()
        output.mkdir(parents=True, exist_ok=True)
        os.startfile(output)

    def export_selection(self) -> None:
        if self.exporting:
            return
        if not self.input_path:
            messagebox.showinfo(APP_NAME, "请先打开一个音频或视频文件。")
            return
        if self.selection_end - self.selection_start < 0.05:
            messagebox.showinfo(APP_NAME, "请先拖动时间轴，选择要导出的区间。")
            return
        self.exporting = True
        mode = "rvc_wav" if self.rvc_wav.get() else "copy"
        self.status_text.set("正在导出...")
        threading.Thread(
            target=self._export_worker,
            args=(self.input_path, self.selection_start, self.selection_end, mode),
            daemon=True,
        ).start()

    def _export_worker(self, path: Path, start: float, end: float, mode: str) -> None:
        try:
            output = trim_media(path, self.output_dir(), start, end, mode)
        except Exception as error:
            self.root.after(0, lambda: self._export_failed(error))
            return
        self.root.after(0, lambda: self._export_finished(output))

    def _export_finished(self, output: Path) -> None:
        self.exporting = False
        self.status_text.set(f"导出成功：{output.name}")

    def _export_failed(self, error: Exception) -> None:
        self.exporting = False
        self.status_text.set("导出失败。")
        messagebox.showerror(APP_NAME, str(error))


class WindowsDropTarget:
    WM_DROPFILES = 0x0233
    GWL_WNDPROC = -4

    def __init__(self, root: Tk, callback):
        self.root = root
        self.callback = callback
        self.user32 = ctypes.windll.user32
        self.shell32 = ctypes.windll.shell32
        self.hwnd = self.user32.GetParent(root.winfo_id()) or root.winfo_id()
        self.wndproc_type = ctypes.WINFUNCTYPE(
            ctypes.c_ssize_t,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.c_void_p,
        )
        self.user32.SetWindowLongPtrW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
        self.user32.SetWindowLongPtrW.restype = ctypes.c_void_p
        self.user32.CallWindowProcW.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.c_void_p,
        ]
        self.user32.CallWindowProcW.restype = ctypes.c_ssize_t
        self.shell32.DragAcceptFiles.argtypes = [ctypes.c_void_p, ctypes.c_bool]
        self.shell32.DragQueryFileW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_wchar_p, ctypes.c_uint]
        self.shell32.DragQueryFileW.restype = ctypes.c_uint
        self.shell32.DragFinish.argtypes = [ctypes.c_void_p]

        self.wndproc = self.wndproc_type(self._wndproc)
        self.original_wndproc = self.user32.SetWindowLongPtrW(
            self.hwnd,
            self.GWL_WNDPROC,
            ctypes.cast(self.wndproc, ctypes.c_void_p),
        )
        if not self.original_wndproc:
            raise ctypes.WinError()
        self.shell32.DragAcceptFiles(self.hwnd, True)

    def _wndproc(self, hwnd, message, wparam, lparam):
        if message == self.WM_DROPFILES:
            paths = self._read_paths(wparam)
            self.root.after(0, lambda: self.callback(paths))
            return 0
        return self.user32.CallWindowProcW(self.original_wndproc, hwnd, message, wparam, lparam)

    def _read_paths(self, drop_handle) -> list[Path]:
        paths = []
        try:
            count = self.shell32.DragQueryFileW(drop_handle, 0xFFFFFFFF, None, 0)
            for index in range(count):
                length = self.shell32.DragQueryFileW(drop_handle, index, None, 0)
                buffer = ctypes.create_unicode_buffer(length + 1)
                self.shell32.DragQueryFileW(drop_handle, index, buffer, length + 1)
                paths.append(Path(buffer.value))
        finally:
            self.shell32.DragFinish(drop_handle)
        return paths


def self_test(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    source_audio = folder / "test_source.wav"
    source_video = folder / "test_source.mp4"
    run_hidden(
        [
            find_tool("ffmpeg"),
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=3",
            "-c:a",
            "pcm_s16le",
            str(source_audio),
        ],
        check=True,
    )
    run_hidden(
        [
            find_tool("ffmpeg"),
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x240:d=3",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=3",
            "-shortest",
            "-c:v",
            "mpeg4",
            "-c:a",
            "aac",
            str(source_video),
        ],
        check=True,
    )
    audio_output = trim_media(source_audio, folder / "clips", 0.5, 1.75, "rvc_wav")
    video_output = trim_media(source_video, folder / "clips", 0.5, 1.75, "copy")
    with wave.open(str(audio_output), "rb") as wav_file:
        assert wav_file.getnchannels() == 1
        assert wav_file.getframerate() == 40000
        assert wav_file.getsampwidth() == 2
    assert 1.0 <= probe_duration(audio_output) <= 1.5
    assert 1.0 <= probe_duration(video_output) <= 1.6
    assert decode_waveform(source_audio)
    print(f"SELF_TEST_OK audio={audio_output.name} video={video_output.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", type=Path)
    parser.add_argument("file", nargs="?", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test(args.self_test)
        return
    root = Tk()
    app = QuickClip(root)
    if args.file:
        root.after(100, lambda: app.load_file(args.file))
    root.mainloop()


if __name__ == "__main__":
    main()
