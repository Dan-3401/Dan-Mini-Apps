using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace TopmostKeeper;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private readonly ListView windowList = new();
    private readonly Button pinButton = new();
    private readonly Button unpinButton = new();
    private readonly Button refreshButton = new();
    private readonly Label statusLabel = new();
    private readonly Label descriptionLabel = new();
    private readonly Label languageLabel = new();
    private readonly ComboBox languageBox = new();
    private readonly System.Windows.Forms.Timer guardTimer = new();
    private readonly RuleStore ruleStore = new();
    private List<WindowInfo> windows = [];
    private int languageIndex;

    private static readonly Dictionary<string, string[]> Texts = new()
    {
        ["Title"] = ["窗口永久置顶工具", "ウィンドウ常時最前面ツール", "Topmost Keeper"],
        ["Description"] = [
            "选择一个正在运行的窗口并设为永久置顶。已保存的规则会持续守护，并在下次启动时自动恢复。",
            "実行中のウィンドウを選択して常に最前面に固定します。保存したルールは次回起動時にも復元されます。",
            "Select a running window to keep it always on top. Saved rules are guarded continuously and restored on the next launch."
        ],
        ["Language"] = ["语言：", "言語：", "Language:"],
        ["Author"] = ["制作：Dan", "制作：Dan", "Made by Dan"],
        ["Pin"] = ["永久置顶", "常に最前面", "Keep On Top"],
        ["Unpin"] = ["取消置顶", "固定を解除", "Remove Pin"],
        ["Refresh"] = ["刷新列表", "一覧を更新", "Refresh List"],
        ["PinnedColumn"] = ["置顶", "固定", "Pinned"],
        ["Process"] = ["进程", "プロセス", "Process"],
        ["Pid"] = ["PID", "PID", "PID"],
        ["WindowTitle"] = ["窗口标题", "ウィンドウタイトル", "Window Title"],
        ["Yes"] = ["是", "はい", "Yes"],
        ["SelectWindow"] = ["请先选择一个窗口。", "先にウィンドウを選択してください。", "Please select a window first."],
        ["WindowCount"] = ["窗口数", "ウィンドウ数", "Windows"],
        ["RuleCount"] = ["永久置顶规则", "固定ルール", "Saved rules"],
        ["PinnedStatus"] = ["已永久置顶", "常に最前面に固定しました", "Pinned"],
        ["UnpinnedStatus"] = ["已取消置顶", "固定を解除しました", "Unpinned"]
    };

    public MainForm()
    {
        MinimumSize = new Size(760, 430);
        Size = new Size(980, 600);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 9F);

        descriptionLabel.AutoSize = true;
        descriptionLabel.Margin = new Padding(12, 12, 8, 0);

        languageLabel.AutoSize = true;
        languageLabel.Margin = new Padding(12, 10, 0, 0);

        languageBox.DropDownStyle = ComboBoxStyle.DropDownList;
        languageBox.Items.AddRange(["中文", "日本語", "English"]);
        languageBox.SelectedIndex = 0;
        languageBox.Width = 100;
        languageBox.SelectedIndexChanged += (_, _) =>
        {
            languageIndex = languageBox.SelectedIndex;
            ApplyLanguage();
            RefreshWindowList();
        };

        var authorLabel = new Label
        {
            AutoSize = true,
            Margin = new Padding(16, 10, 0, 0),
            Text = "Made by Dan"
        };

        var topRow = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 32,
            WrapContents = false
        };
        topRow.Controls.Add(languageLabel);
        topRow.Controls.Add(languageBox);
        topRow.Controls.Add(authorLabel);

        var header = new Panel { Dock = DockStyle.Top, Height = 68 };
        header.Controls.Add(topRow);
        header.Controls.Add(descriptionLabel);
        descriptionLabel.Dock = DockStyle.Bottom;
        descriptionLabel.Height = 34;

        windowList.Dock = DockStyle.Fill;
        windowList.View = View.Details;
        windowList.FullRowSelect = true;
        windowList.MultiSelect = false;
        windowList.HideSelection = false;
        windowList.Columns.Add("", 80);
        windowList.Columns.Add("", 170);
        windowList.Columns.Add("", 80);
        windowList.Columns.Add("", 570);
        windowList.DoubleClick += (_, _) => PinSelected();

        pinButton.AutoSize = true;
        pinButton.Click += (_, _) => PinSelected();

        unpinButton.AutoSize = true;
        unpinButton.Click += (_, _) => UnpinSelected();

        refreshButton.AutoSize = true;
        refreshButton.Click += (_, _) => RefreshWindowList();

        statusLabel.AutoSize = true;
        statusLabel.Margin = new Padding(14, 9, 0, 0);

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 50,
            Padding = new Padding(10, 9, 10, 0),
            WrapContents = false
        };
        actions.Controls.Add(pinButton);
        actions.Controls.Add(unpinButton);
        actions.Controls.Add(refreshButton);
        actions.Controls.Add(statusLabel);

        Controls.Add(windowList);
        Controls.Add(actions);
        Controls.Add(header);
        ApplyLanguage();

        guardTimer.Interval = 1000;
        guardTimer.Tick += (_, _) => GuardPinnedWindows();
        Shown += (_, _) =>
        {
            ruleStore.Load();
            GuardPinnedWindows();
            RefreshWindowList();
            guardTimer.Start();
        };
    }

    private void PinSelected()
    {
        var selected = GetSelectedWindow();
        if (selected is null)
        {
            MessageBox.Show(T("SelectWindow"), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        NativeMethods.SetTopmost(selected.Handle, true);
        ruleStore.Add(selected);
        RefreshWindowList();
        statusLabel.Text = $"{T("PinnedStatus")}：{selected.ProcessName}";
    }

    private void UnpinSelected()
    {
        var selected = GetSelectedWindow();
        if (selected is null)
        {
            MessageBox.Show(T("SelectWindow"), Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        NativeMethods.SetTopmost(selected.Handle, false);
        ruleStore.Remove(selected);
        RefreshWindowList();
        statusLabel.Text = $"{T("UnpinnedStatus")}：{selected.ProcessName}";
    }

    private WindowInfo? GetSelectedWindow()
    {
        if (windowList.SelectedItems.Count == 0)
        {
            return null;
        }

        return windowList.SelectedItems[0].Tag as WindowInfo;
    }

    private void GuardPinnedWindows()
    {
        foreach (var window in WindowFinder.GetVisibleWindows())
        {
            if (ruleStore.Matches(window))
            {
                NativeMethods.SetTopmost(window.Handle, true);
            }
        }
    }

    private void RefreshWindowList()
    {
        var selectedHandle = GetSelectedWindow()?.Handle;
        windows = WindowFinder.GetVisibleWindows();
        windowList.BeginUpdate();
        windowList.Items.Clear();

        foreach (var window in windows)
        {
            var isPinned = ruleStore.Matches(window);
            var item = new ListViewItem(isPinned ? T("Yes") : "");
            item.SubItems.Add(window.ProcessName);
            item.SubItems.Add(window.ProcessId.ToString());
            item.SubItems.Add(window.Title);
            item.Tag = window;
            windowList.Items.Add(item);

            if (window.Handle == selectedHandle)
            {
                item.Selected = true;
            }
        }

        windowList.EndUpdate();
        statusLabel.Text = $"{T("WindowCount")}：{windows.Count}    {T("RuleCount")}：{ruleStore.Count}";
    }

    private string T(string key) => Texts[key][languageIndex];

    private void ApplyLanguage()
    {
        Text = T("Title");
        descriptionLabel.Text = T("Description");
        languageLabel.Text = T("Language");
        pinButton.Text = T("Pin");
        unpinButton.Text = T("Unpin");
        refreshButton.Text = T("Refresh");
        windowList.Columns[0].Text = T("PinnedColumn");
        windowList.Columns[1].Text = T("Process");
        windowList.Columns[2].Text = T("Pid");
        windowList.Columns[3].Text = T("WindowTitle");
    }
}

internal sealed record WindowInfo(IntPtr Handle, int ProcessId, string ProcessName, string? ExecutablePath, string Title);

internal sealed record PinRule(string ProcessName, string? ExecutablePath);

internal sealed class RuleStore
{
    private static readonly string StoreDirectory =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "TopmostKeeper");
    private static readonly string StorePath = Path.Combine(StoreDirectory, "rules.json");
    private readonly List<PinRule> rules = [];

    public int Count => rules.Count;

    public void Load()
    {
        try
        {
            if (File.Exists(StorePath))
            {
                rules.AddRange(JsonSerializer.Deserialize<List<PinRule>>(File.ReadAllText(StorePath)) ?? []);
            }
        }
        catch
        {
            rules.Clear();
        }
    }

    public bool Matches(WindowInfo window) =>
        rules.Any(rule =>
            !string.IsNullOrWhiteSpace(rule.ExecutablePath) && !string.IsNullOrWhiteSpace(window.ExecutablePath)
                ? string.Equals(rule.ExecutablePath, window.ExecutablePath, StringComparison.OrdinalIgnoreCase)
                : string.Equals(rule.ProcessName, window.ProcessName, StringComparison.OrdinalIgnoreCase));

    public void Add(WindowInfo window)
    {
        if (!Matches(window))
        {
            rules.Add(new PinRule(window.ProcessName, window.ExecutablePath));
            Save();
        }
    }

    public void Remove(WindowInfo window)
    {
        rules.RemoveAll(rule =>
            !string.IsNullOrWhiteSpace(rule.ExecutablePath) && !string.IsNullOrWhiteSpace(window.ExecutablePath)
                ? string.Equals(rule.ExecutablePath, window.ExecutablePath, StringComparison.OrdinalIgnoreCase)
                : string.Equals(rule.ProcessName, window.ProcessName, StringComparison.OrdinalIgnoreCase));
        Save();
    }

    private void Save()
    {
        Directory.CreateDirectory(StoreDirectory);
        File.WriteAllText(StorePath, JsonSerializer.Serialize(rules, new JsonSerializerOptions { WriteIndented = true }));
    }
}

internal static class WindowFinder
{
    public static List<WindowInfo> GetVisibleWindows()
    {
        var windows = new List<WindowInfo>();
        NativeMethods.EnumWindows((handle, _) =>
        {
            if (!NativeMethods.IsWindowVisible(handle) || NativeMethods.GetWindowTextLength(handle) == 0)
            {
                return true;
            }

            NativeMethods.GetWindowThreadProcessId(handle, out var processId);
            try
            {
                using var process = Process.GetProcessById((int)processId);
                string? executablePath = null;
                try
                {
                    executablePath = process.MainModule?.FileName;
                }
                catch
                {
                    // Some elevated or system processes do not expose their executable path.
                }

                var title = new StringBuilder(NativeMethods.GetWindowTextLength(handle) + 1);
                NativeMethods.GetWindowText(handle, title, title.Capacity);
                windows.Add(new WindowInfo(handle, process.Id, process.ProcessName, executablePath, title.ToString()));
            }
            catch
            {
                // The process may exit between enumeration and inspection.
            }

            return true;
        }, IntPtr.Zero);

        return windows
            .OrderBy(window => window.ProcessName, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(window => window.Title, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }
}

internal static class NativeMethods
{
    private static readonly IntPtr HwndTopmost = new(-1);
    private static readonly IntPtr HwndNotTopmost = new(-2);
    private const uint SwpNoSize = 0x0001;
    private const uint SwpNoMove = 0x0002;
    private const uint SwpNoActivate = 0x0010;
    private const uint Flags = SwpNoSize | SwpNoMove | SwpNoActivate;

    internal delegate bool EnumWindowsProc(IntPtr handle, IntPtr parameter);

    [DllImport("user32.dll")]
    internal static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    internal static extern bool IsWindowVisible(IntPtr handle);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern int GetWindowText(IntPtr handle, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    internal static extern int GetWindowTextLength(IntPtr handle);

    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(
        IntPtr handle,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags);

    internal static void SetTopmost(IntPtr handle, bool topmost) =>
        SetWindowPos(handle, topmost ? HwndTopmost : HwndNotTopmost, 0, 0, 0, 0, Flags);
}
