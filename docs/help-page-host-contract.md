# 說明頁匯出與宿主（GameHelper）職責分工

匯出的說明頁（html + `styles.css` + `script.js` + `_assets`）會被兩個地方使用：

- **美術預覽**：直接開匯出的 html（或 plugin 的下載預覽）
- **宿主**：GameHelper 魚機說明頁（`FishHelpPageComponent`），把 html 注入自己的頁面

兩邊必須跑**同一份 `script.js`**，所以原則是：**匯出內容自己管**。互動、分頁、頁碼、swiper 初始化都寫在 runtime（`packages/backend/src/interactions/interactionRuntime.ts`），宿主不另外實作。

## 本套件負責

- 互動 runtime：翻頁、prototype reaction、swiper、頁碼（`_HELP_PAGE`，依實際 slide 數計算）
- 匯出結構：每一頁是 `<template data-fig-template>`，slide 根節點的 `data-layer` 為 Figma 原稿圖層名稱
- 獨立 html 的啟動：head 的 inline init（含 px2vw）

## 提供給宿主的接口（契約）

| 項目 | 規則 |
|---|---|
| 入口 | `window.figmaHelp.mount(model?)`；model 不傳時讀 `#figma-interaction-model` |
| 自動執行 | 拆出的 `script.js` **不自動執行**（`apps/plugin/plugin-src/code.ts` 的 `deferImmediateScript` 會去掉 `runFigmaInteractionInit`），由獨立 html 的 inline init 或宿主的 `mount` 啟動 |
| 重複 mount | 必須可以重複呼叫，不能沿用上一次的 model / 監聽 |
| 刪頁 | 宿主會在注入前刪掉指定 `data-layer` 的 template；runtime 要能接受頁面缺號，頁碼依實際頁數 |
| 外部依賴 | Swiper 由宿主全域提供（`window.Swiper`）；其他需要的 css / js 必須以相對路徑寫在 html `<head>`，宿主會照順序載入 |
| px2vw | 只在獨立 html 的 inline init 執行；`mount` 不改 `--px2vw-ratio`（宿主用自己的縮放） |

## 宿主只做的事（不要期待宿主幫忙補）

1. 依 closeList 刪掉整頁 template（例如 `extra_bet` → `_HELP_EXTRA_BET`）
2. 轉 `_assets/` 路徑、注入 body、載入 head 中相對路徑的 css / js
3. 呼叫 `figmaHelp.mount(model)`
4. 關閉鈕 `_HELP_CLOSE_MODAL` 通知外層、外層縮放置中

## 修改規則

- 改 runtime 行為：改本套件 → 重新出檔，宿主不需要跟著改
- 改上方接口（名稱、參數、自動執行與否）：屬於破壞性變更，需同時改 GameHelper 並更新兩邊文件（GameHelper 的 `CLAUDE.md`「魚機說明頁（figma 匯出）職責分工」）
- 不要讓 runtime 依賴宿主的 DOM、class 或全域變數（Swiper 除外）
