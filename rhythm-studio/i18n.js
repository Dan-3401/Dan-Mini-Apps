const rhythmMessages = {
  zh: {
    title: "律动透明视频工坊", subtitle: "拖入音频或视频，生成可叠加到剪辑项目中的透明律动素材。",
    credit: "Dan 制作", reset: "恢复默认", export: "导出素材", import: "导入素材",
    support: "支持 MP3、WAV、M4A、MP4、WebM", drop: "拖入音频 / 视频", choose: "或点击选择本地文件",
    style: "样式", custom: "自定义", primary: "主色", secondary: "辅色", count: "元素数量",
    power: "律动强度", thickness: "线条粗细", smooth: "平滑程度", radius: "基础半径",
    status: "演示模式", canvas: "画布", fps: "帧率", transparent: "透明背景预览", layout: "频谱布局",
    toggles: ["弱频活跃补偿", "镜像效果", "辉光效果", "导出包含原音频"], exportMode: "导出方式",
    layouts: ["原始频段：低 → 高", "中心对称：高 ← 低 → 高", "双向镜像：低 → 高 ← 低"],
    exports: ["长素材：透明 PNG 序列写入文件夹", "短素材：透明 PNG 序列 ZIP", "兼容导出：透明 WebM（实时录制）"],
    tips: ["透明背景", "导出的 WebM 可作为叠加素材使用", "实时响应", "频谱会跟随素材音量变化", "本地处理", "素材不会上传到网络"],
    styles: ["环形频谱", "长条频谱", "流动波形", "粒子轨道", "线性脉冲"]
  },
  ja: {
    title: "リズム透明動画スタジオ", subtitle: "音声または動画を読み込み、編集素材として重ねられる透明リズム映像を生成します。",
    credit: "Dan 制作", reset: "初期設定に戻す", export: "素材を書き出す", import: "素材を読み込む",
    support: "MP3、WAV、M4A、MP4、WebM に対応", drop: "音声 / 動画をドロップ", choose: "またはクリックしてファイルを選択",
    style: "スタイル", custom: "カスタマイズ", primary: "メイン色", secondary: "サブ色", count: "要素数",
    power: "反応の強さ", thickness: "線の太さ", smooth: "スムージング", radius: "基本半径",
    status: "デモモード", canvas: "キャンバス", fps: "FPS", transparent: "透明背景プレビュー", layout: "スペクトラム配置",
    toggles: ["低周波補正", "ミラー効果", "グロー効果", "元の音声を含める"], exportMode: "書き出し方法",
    layouts: ["元の周波数帯：低 → 高", "中央対称：高 ← 低 → 高", "双方向ミラー：低 → 高 ← 低"],
    exports: ["長尺：透明 PNG シーケンスをフォルダーに保存", "短尺：透明 PNG シーケンス ZIP", "互換書き出し：透明 WebM（リアルタイム録画）"],
    tips: ["透明背景", "WebM をオーバーレイ素材として使用できます", "リアルタイム反応", "音量に合わせてスペクトラムが変化します", "ローカル処理", "素材はネットワークへ送信されません"],
    styles: ["円形スペクトラム", "バースペクトラム", "ウェーブ", "パーティクル軌道", "ラインパルス"]
  },
  en: {
    title: "Rhythm Transparent Video Studio", subtitle: "Drop in audio or video and generate transparent reactive overlays for your editing projects.",
    credit: "Made by Dan", reset: "Reset", export: "Export", import: "Import media",
    support: "Supports MP3, WAV, M4A, MP4 and WebM", drop: "Drop audio / video", choose: "or click to choose a local file",
    style: "Style", custom: "Customize", primary: "Primary", secondary: "Secondary", count: "Element count",
    power: "Reaction strength", thickness: "Line thickness", smooth: "Smoothing", radius: "Base radius",
    status: "Demo mode", canvas: "Canvas", fps: "FPS", transparent: "Transparent background preview", layout: "Spectrum layout",
    toggles: ["Low-frequency activity boost", "Mirror effect", "Glow effect", "Include original audio"], exportMode: "Export mode",
    layouts: ["Original bands: low → high", "Center symmetry: high ← low → high", "Two-way mirror: low → high ← low"],
    exports: ["Long clip: write transparent PNG sequence to folder", "Short clip: transparent PNG sequence ZIP", "Compatibility export: transparent WebM (real-time recording)"],
    tips: ["Transparent background", "Exported WebM can be used as an overlay", "Real-time response", "Spectrum reacts to media volume", "Local processing", "Your media is not uploaded"],
    styles: ["Circular spectrum", "Bar spectrum", "Flowing wave", "Particle orbit", "Linear pulse"]
  }
};

function setRhythmLanguage(language) {
  const m = rhythmMessages[language] || rhythmMessages.zh;
  document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  document.title = m.title;
  document.querySelector("h1").textContent = m.title;
  document.querySelector(".subtitle").textContent = m.subtitle;
  document.querySelector("#creatorCredit").textContent = m.credit;
  document.querySelector("#resetBtn").textContent = m.reset;
  document.querySelector("#exportBtn").textContent = m.export;
  const headings = document.querySelectorAll(".panel-title h2");
  [m.import, m.style, m.custom].forEach((text, index) => headings[index].textContent = text);
  document.querySelector(".panel-title p").textContent = m.support;
  document.querySelector("#dropZone strong").textContent = m.drop;
  document.querySelector("#dropZone small").textContent = m.choose;
  const labels = document.querySelectorAll(".form-grid label, .control-row");
  [m.primary, m.secondary, m.count, m.power, m.thickness, m.smooth, m.radius].forEach((text, index) => {
    labels[index].childNodes[0].textContent = `${text} `;
  });
  document.querySelector("#statusText").textContent = m.status;
  const toolbarLabels = document.querySelectorAll(".canvas-size label");
  toolbarLabels[0].childNodes[0].textContent = `${m.canvas} `;
  toolbarLabels[1].childNodes[0].textContent = `${m.fps} `;
  document.querySelector(".transparent-badge").textContent = m.transparent;
  document.querySelectorAll(".style-card b").forEach((node, index) => node.textContent = m.styles[index]);
  const selectLabels = document.querySelectorAll(".select-row span");
  selectLabels[0].textContent = m.layout;
  selectLabels[1].textContent = m.exportMode;
  document.querySelectorAll(".toggle-row span").forEach((node, index) => node.textContent = m.toggles[index]);
  document.querySelectorAll("#spectrumLayout option").forEach((node, index) => node.textContent = m.layouts[index]);
  document.querySelectorAll("#exportMode option").forEach((node, index) => node.textContent = m.exports[index]);
  document.querySelectorAll(".tips b, .tips span").forEach((node, index) => node.textContent = m.tips[index]);
  localStorage.setItem("rhythm-language", language);
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.querySelector("#languageSelect");
  select.value = localStorage.getItem("rhythm-language") || "zh";
  select.addEventListener("change", event => setRhythmLanguage(event.target.value));
  setRhythmLanguage(select.value);
});
