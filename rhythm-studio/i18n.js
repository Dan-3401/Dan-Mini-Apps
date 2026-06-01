const rhythmMessages = {
  zh: {
    title: "律动透明视频工坊", subtitle: "拖入音频或视频，生成可叠加到剪辑项目中的透明律动素材。",
    credit: "Dan 制作", reset: "恢复默认", export: "导出素材", import: "导入素材",
    support: "支持 MP3、WAV、M4A、MP4、WebM", drop: "拖入音频 / 视频", choose: "或点击选择本地文件",
    style: "样式", custom: "自定义", primary: "主色", secondary: "辅色", count: "元素数量",
    power: "律动强度", thickness: "线条粗细", smooth: "平滑程度", radius: "基础半径",
    status: "演示模式", canvas: "画布", fps: "帧率", transparent: "透明背景预览",
    styles: ["环形频谱", "长条频谱", "流动波形", "粒子轨道", "线性脉冲"]
  },
  ja: {
    title: "リズム透明動画スタジオ", subtitle: "音声または動画を読み込み、編集素材として重ねられる透明リズム映像を生成します。",
    credit: "Dan 制作", reset: "初期設定に戻す", export: "素材を書き出す", import: "素材を読み込む",
    support: "MP3、WAV、M4A、MP4、WebM に対応", drop: "音声 / 動画をドロップ", choose: "またはクリックしてファイルを選択",
    style: "スタイル", custom: "カスタマイズ", primary: "メイン色", secondary: "サブ色", count: "要素数",
    power: "反応の強さ", thickness: "線の太さ", smooth: "スムージング", radius: "基本半径",
    status: "デモモード", canvas: "キャンバス", fps: "FPS", transparent: "透明背景プレビュー",
    styles: ["円形スペクトラム", "バースペクトラム", "ウェーブ", "パーティクル軌道", "ラインパルス"]
  },
  en: {
    title: "Rhythm Transparent Video Studio", subtitle: "Drop in audio or video and generate transparent reactive overlays for your editing projects.",
    credit: "Made by Dan", reset: "Reset", export: "Export", import: "Import media",
    support: "Supports MP3, WAV, M4A, MP4 and WebM", drop: "Drop audio / video", choose: "or click to choose a local file",
    style: "Style", custom: "Customize", primary: "Primary", secondary: "Secondary", count: "Element count",
    power: "Reaction strength", thickness: "Line thickness", smooth: "Smoothing", radius: "Base radius",
    status: "Demo mode", canvas: "Canvas", fps: "FPS", transparent: "Transparent background preview",
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
  localStorage.setItem("rhythm-language", language);
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.querySelector("#languageSelect");
  select.value = localStorage.getItem("rhythm-language") || "zh";
  select.addEventListener("change", event => setRhythmLanguage(event.target.value));
  setRhythmLanguage(select.value);
});
