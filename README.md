# 桌遊大廳

原創策略桌遊合集，做成 PWA：可以安裝到手機主畫面、離線遊玩，支援 AI 對手與同機多人（熱座）。

## 遊戲

| 遊戲 | 路徑 | 說明 |
|---|---|---|
| 控股風雲 | `games/proxy-war/` | 股權策略：內線推理、搶董事會控股權，六季後身價最高者勝。 |
| 失憶特工 | `games/blank-agents/` | 隱藏身分：看得到別人、看不到自己，推理身分後選對直升機撤離。 |
| 無名信 | `games/unsigned/` | 匿名推理：互寄匿名信，從蠟封顏色找出寄件人，終刊一次清算。 |
| 七日斷腸 | `games/seven-days/` | 勒索談判：公開下毒、秘密毒性，拿解藥換秘笈分，七天後分高者勝。 |

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
