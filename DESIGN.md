# DESIGN.md — TodoTracker

改編自 getdesign.md 的 OpenCode 分析（terminal-native、全等寬字、暖白底）。
核心：**全等寬字體、暖奶油白底、近黑墨色、4px 圓角只給互動元件、ASCII 括號標記當項目符號、零陰影**。

---

## Color

```css
/* Brand */
--ink:            #201d1d;  /* 標題、內文、主要 CTA 填色 */
--ink-deep:       #0f0000;  /* CTA pressed */
--canvas:         #fdfcfc;  /* 頁面底、卡片面、on-primary 文字 */

/* Surface */
--surface-soft:   #f8f7f7;  /* input 底、次要列 */
--surface-card:   #f1eeee;  /* code snippet、disabled 按鈕 */
--surface-dark:   #201d1d;  /* 唯一的深色區塊（計時器面板） */
--surface-dark-2: #302c2c;  /* 深色區塊內的內嵌列 */
--hairline:       rgba(15,0,0,0.12);
--hairline-strong:#646262;

/* Text */
--text-ink:       #201d1d;
--text-charcoal:  #302c2c;
--text-body:      #424245;
--text-mute:      #646262;
--text-stone:     #6e6e73;
--text-ash:       #9a9898;

/* Semantic (Apple HIG ramp) */
--accent:  #007aff;  --accent-hover:  #0056b3;  --accent-active:  #004085;
--danger:  #ff3b30;  --danger-hover:  #d70015;  --danger-active:  #a50011;
--warning: #ff9f0a;  --warning-hover: #cc7f08;  --warning-active: #995f06;
--success: #30d158;
```

## Typography

**100% 等寬字。沒有 sans-serif、沒有斜體。**

```css
--font: "Berkeley Mono", ui-monospace, SFMono-Regular, "SF Mono",
        Menlo, Consolas, "Liberation Mono", monospace;
```

| Token | Size / Weight / LH | 用在 |
|---|---|---|
| display-xl | 38 / 700 / 1.5 | 頁面主標 |
| heading-md | 16 / 700 / 1.5 | 區塊標題 |
| body-md | 16 / 400 / 1.5 | 內文（預設） |
| body-strong | 16 / 500 / 1.5 | 行內強調、主導覽 |
| button-md | 16 / 500 / 2 | 按鈕 |
| caption-md | 14 / 400 / 2 | 註腳、badge、metadata |

## Spacing

8px 基準，細部有 1 / 2 / 4px。區塊節奏 96px（響應式降到 64 → 48）。

```
xxs 1 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · section 96
```

## Radius

只有兩個值在做事：

- `0` — 區塊、面板、導覽、footer（**預設**）
- `4px` — 每一個互動元件（按鈕、input、tab、badge、snippet）
- `9999` — 只有 avatar 圓點

## Elevation

**零 drop shadow。** 深度只靠三種東西：

- Level 1：`1px solid var(--hairline)`
- Level 2：`1px solid var(--hairline-strong)`
- Level 3：`background: var(--surface-dark)` — 全系統唯一的「浮起」表面

## Components

| 元件 | 規格 |
|---|---|
| button-primary | bg ink · text canvas · radius 4 · height 36 · padding-x 20 |
| button-primary:active | bg ink-deep |
| button-secondary | bg canvas · text ink · 1px hairline-strong · radius 4 |
| button-disabled | bg surface-card · text ash |
| tab | 預設 text mute；active 為 text ink + 2px ink 底線 |
| badge | bg surface-dark · text canvas · padding 2/8 · radius 4 |
| input | bg surface-soft · 1px hairline · radius 4 · height 40 · padding 12 |
| input:focus | bg canvas · 1px ink border |
| textarea | 同 input · min-height 96 |

## ASCII 標記

括號標記取代所有圖示式圖示。**`[+]` / `[-]` 一定要是可點的**，
不能拿來當純裝飾的項目符號 —— 使用者看到 `[+]` 就會預期它能展開。

| 標記 | 意思 | 狀態 |
|---|---|---|
| `[+]` | 已收合，點了會展開 | 互動 |
| `[-]` | 已展開，點了會收合 | 互動 |
| `[x]` | 已完成 / 關閉 | 互動或狀態 |
| `[ ]` | 未完成 | 互動 |
| `[>]` | 執行 / 開始 | 互動 |
| `[!]` | 需要注意 | 純狀態 |

靜態的區塊標題不加標記，直接寫文字就好。

## 套用到 TodoTracker 的決定

- 計時器面板是**唯一**的 `surface-dark` 區塊 —— 對應 OpenCode 的 hero TUI mockup。
- 時間數字用等寬字 + `font-variant-numeric: tabular-nums`，跳秒時不會抖動。
- 專案顏色只以 8px 方塊（radius 0）呈現，不做彩色底、不做漸層。
- Todo 勾選框用 `[ ]` / `[x]` 純文字，不用 checkbox 元件。
- 分隔線一律 1px hairline，不用留白或陰影分區。
- 沒有動畫過場；狀態切換即時。
