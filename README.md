# 桌遊大廳

原創策略桌遊合集，做成 PWA：可以安裝到手機主畫面、離線遊玩，支援 AI 對手與同機多人（熱座）。

## 遊戲

| 遊戲 | 路徑 | 說明 |
|---|---|---|
| 控股風雲 | `games/proxy-war/` | 股權策略：內線推理、搶董事會控股權，六季後身價最高者勝。 |
| 財富自由之路 | `games/wealth-road/` | 財商養成：22 到 62 歲分配時間、看懂景氣、累積資產，讓被動收入追上支出。支援線上連線。 |

## 結構

- `index.html`：遊戲大廳
- `games/<id>/index.html`：每款遊戲各自是一個自足的 HTML 檔
- `manifest.webmanifest`、`icons/`：PWA 安裝資訊
- `sw.js`：離線快取。新增遊戲時把檔案加進 `PRECACHE`，並把 `VERSION` 加一
- `.github/workflows/pages.yml`：推到 `main` 就自動部署到 GitHub Pages

## 本機測試

```sh
python3 -m http.server 8000
```

然後開 http://localhost:8000/ 。
