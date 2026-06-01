const paperStockTranslations = {
  ja: {
    "纸上牛市": "ペーパーブルマーケット", "本地模拟交易终端 · 数据自动保存": "ローカル模擬取引端末 · データ自動保存",
    "Dan 制作": "Dan 制作", "模拟行情运行中": "模擬相場 稼働中", "重置账户": "口座をリセット",
    "总资产": "総資産", "现金 + 持仓市值": "現金 + 保有時価", "可用资金": "利用可能資金", "初始资金 ¥100,000.00": "初期資金 ¥100,000.00",
    "持仓市值": "保有時価", "累计收益": "累計損益", "模拟行情": "模擬相場", "每 3 秒更新": "3 秒ごとに更新",
    "我的持仓": "保有銘柄", "点击行情切换股票": "相場をクリックして銘柄を切替", "快捷交易": "クイック取引",
    "买入": "買い", "卖出": "売り", "股票": "銘柄", "模拟市价": "模擬市場価格", "数量（股）": "数量（株）",
    "支持任意整数": "整数を入力", "输入数量": "数量を入力", "全部": "すべて", "预计金额": "見積金額",
    "确认买入": "買い注文を確定", "确认卖出": "売り注文を確定", "交易记录": "取引履歴", "最新记录在上方": "最新の記録が上",
    "玩法说明": "遊び方", "轻量单机版": "軽量ローカル版", "时间": "時刻", "类型": "種類", "价格": "価格", "数量": "数量", "成交额": "約定金額",
    "仅供娱乐和练习，不构成任何投资建议，不接入真实账户或真实行情。": "娯楽と練習専用です。投資助言ではなく、実際の口座や相場には接続しません。"
  },
  en: {
    "纸上牛市": "Paper Bull Market", "本地模拟交易终端 · 数据自动保存": "Local paper trading terminal · Autosaved data",
    "Dan 制作": "Made by Dan", "模拟行情运行中": "Simulated market live", "重置账户": "Reset account",
    "总资产": "Total assets", "现金 + 持仓市值": "Cash + position value", "可用资金": "Available cash", "初始资金 ¥100,000.00": "Starting cash ¥100,000.00",
    "持仓市值": "Position value", "累计收益": "Total profit", "模拟行情": "Simulated market", "每 3 秒更新": "Updates every 3 seconds",
    "我的持仓": "My positions", "点击行情切换股票": "Click a quote to switch stock", "快捷交易": "Quick trade",
    "买入": "Buy", "卖出": "Sell", "股票": "Stock", "模拟市价": "Simulated market price", "数量（股）": "Quantity",
    "支持任意整数": "Any whole number", "输入数量": "Enter quantity", "全部": "All", "预计金额": "Estimated amount",
    "确认买入": "Confirm buy", "确认卖出": "Confirm sell", "交易记录": "Trade history", "最新记录在上方": "Newest first",
    "玩法说明": "How it works", "轻量单机版": "Lightweight local edition", "时间": "Time", "类型": "Type", "价格": "Price", "数量": "Quantity", "成交额": "Amount",
    "仅供娱乐和练习，不构成任何投资建议，不接入真实账户或真实行情。": "For entertainment and practice only. This is not investment advice and does not connect to real accounts or market data."
  }
};
const paperStockOriginalText = new WeakMap();
const paperStockOriginalPlaceholder = new WeakMap();
let paperStockLanguage = localStorage.getItem("paper-stock-language") || "zh";

function translatePaperText(text) {
  if (paperStockLanguage === "zh") return text;
  const map = paperStockTranslations[paperStockLanguage];
  return map[text.trim()] || text;
}
function translatePaperNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!paperStockOriginalText.has(node)) paperStockOriginalText.set(node, node.nodeValue);
    const original = paperStockOriginalText.get(node);
    const trimmed = original.trim();
    if (trimmed) node.nodeValue = original.replace(trimmed, translatePaperText(trimmed));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || ["SCRIPT", "STYLE"].includes(node.tagName)) return;
  if (node.hasAttribute("placeholder")) {
    if (!paperStockOriginalPlaceholder.has(node)) paperStockOriginalPlaceholder.set(node, node.placeholder);
    node.placeholder = translatePaperText(paperStockOriginalPlaceholder.get(node));
  }
  node.childNodes.forEach(translatePaperNode);
}
function setPaperStockLanguage(language) {
  paperStockLanguage = language;
  localStorage.setItem("paper-stock-language", language);
  document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  document.title = language === "ja" ? "ペーパーブルマーケット · 模擬株取引" : language === "en" ? "Paper Bull Market · Stock Simulator" : "纸上牛市 · 模拟炒股";
  translatePaperNode(document.body);
}
const paperStockSelect = document.querySelector("#languageSelect");
paperStockSelect.value = paperStockLanguage;
paperStockSelect.addEventListener("change", event => setPaperStockLanguage(event.target.value));
new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(translatePaperNode)))
  .observe(document.body, { childList: true, subtree: true });
setPaperStockLanguage(paperStockLanguage);
