# Img-Calendar

[![License](https://img.shields.io/github/license/pig-ci/img-calendar?style=flat-square&color=blue)](https://github.com/pig-ci/img-calendar/blob/main/LICENSE)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript-f7df1e?style=flat-square&logo=javascript&logoColor=black)](https://github.com/pig-ci/img-calendar)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-222222?style=flat-square&logo=github-pages&logoColor=white)](https://pig-ci.github.io/img-calendar/)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-brightgreen?style=flat-square)](https://pig-ci.github.io/img-calendar/)
[![Stars](https://img.shields.io/github/stars/pig-ci/img-calendar?style=flat-square&color=yellow)](https://github.com/pig-ci/img-calendar/stargazers)
[![Forks](https://img.shields.io/github/forks/pig-ci/img-calendar?style=flat-square&color=blueviolet)](https://github.com/pig-ci/img-calendar/network/members)
[![Last Commit](https://img.shields.io/github/last-commit/pig-ci/img-calendar?style=flat-square&color=orange)](https://github.com/pig-ci/img-calendar/commits/main)

> 一個簡潔的網頁版圖片日曆，讓你在月曆檢視中輕鬆管理事件與對應圖片。

## 專案簡介

**Img-Calendar** 是一個純前端的網頁應用，將「日曆」與「圖片管理」結合。你可以在月曆上新增事件，為每個事件填寫標題、日期、時間、描述，並上傳一張代表圖片，所有資料即時儲存在瀏覽器端，無需後端伺服器即可使用。

本專案部署於 GitHub Pages，可直接線上體驗：  
**[點我體驗](https://pig-ci.github.io/img-calendar/)**

## 功能特色

- **月曆檢視** — 以直觀的月曆介面瀏覽事件，快速切換月份。
- **事件管理** — 支援新增、編輯與刪除事件，可設定標題、日期、全天/時間區間、描述。
- **圖片附加** — 每個事件可上傳一張圖片，並在需要時移除圖片。
- **本機儲存** — 所有資料儲存在瀏覽器端，重新整理頁面不會遺失，無需註冊帳號。
- **響應式設計** — 適配桌面與行動裝置，隨處可用。
- **零依賴部署** — 純靜態網頁，無需後端，可輕鬆部署到任何靜態託管服務。

## 技術棧

| 類別 | 技術 |
|------|------|
| 前端語言 | JavaScript (Vanilla) |
| 樣式 | CSS3 |
| 圖示 | Favicon 自訂 SVG |
| 部署 | GitHub Pages |
| 版本控制 | Git / GitHub |

專案結構單純，主要由 `index.html`、`style.css` 與 `js/` 目錄下的 JavaScript 檔案組成。

## 🚀 快速開始

### 線上使用
直接開啟 **https://pig-ci.github.io/img-calendar/** 即可開始使用，無需安裝任何軟體。

### 本機運行
```bash
# 1. 複製專案
git clone https://github.com/pig-ci/img-calendar.git

# 2. 進入專案目錄
cd img-calendar

# 3. 直接用瀏覽器開啟 index.html
#    或使用簡易伺服器（擇一）
npx serve .
# 或
python -m http.server 8000
```

## 專案結構

```
img-calendar/
├── index.html          # 主頁面
├── style.css           # 樣式表
├── favicon.svg         # 網站圖示
├── script.js                 # JavaScript 邏輯
├── LICENSE             # 授權條款
└── README.md           # 專案說明
```

## 使用說明

1. 開啟頁面後，你會看到當月的月曆檢視。
2. 點擊 **「新增事件」** 按鈕。
3. 在彈出視窗中填寫：
   - **標題**（必填）
   - **日期**（必填）
   - **全天** 或 **開始/結束時間**
   - **描述**（選填）
   - **圖片**（可選擇圖片上傳，或移除已選圖片）
4. 點擊 **「儲存」** 即可將事件加入日曆。
5. 若要刪除事件，點擊事件後選擇 **「刪除」** 即可。

## 貢獻指南

歡迎任何形式的貢獻！無論是回報 Bug、提出功能建議，或是直接提交 Pull Request，都非常感謝。

1. Fork 本專案
2. 建立你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 授權條款

本專案採用 **MIT License** 授權，詳細內容請參閱 [LICENSE](https://github.com/pig-ci/img-calendar/blob/main/LICENSE) 檔案。
