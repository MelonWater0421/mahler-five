# Bruckner 8 · 声音大教堂与复调导览 (Sonic Cathedral & Contrapuntal Guide)

> **Anton Bruckner · Symphony No. 8 in C minor (WAB 108)**  
> **Robert Haas Edition (1890 Version with restored cuts) · Calibrated to Günter Wand**  
> Interactive Web Guide · Dual-Language (中英双语) · Polyphony Choir Radar · Web Audio Theme Synthesizer · Quadruple Counterpoint Analysis

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen)](#)
[![Zero Build](https://img.shields.io/badge/Zero%20Build-Pure%20HTML5%2FCSS3%2FJS-blue)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 项目亮点 / Key Features

- **🌐 动态中英双语切换 (Dynamic Bilingual Engine)**:
  - 顶栏一键切换中/英文（`#langBtn`），实时重绘界面、时间轴与弹窗，无需刷新页面，音频播放与时间位置零中断。
  - Instant one-click toggle between English and Chinese with zero interruption to audio playback.

- **🏰 声音大教堂与复调雷达 (Polyphony Choir Radar)**:
  - 实时追踪交响乐团五大声部群组（木管组、4圆号与4瓦格纳大号组、重铜管与定音鼓组、全弦乐群、三把竖琴与打击乐色彩组）的动态比重与复调交织。
  - Real-time visualization of orchestral choir stratification (Woodwinds, Horns & Wagner Tubas, Heavy Brass & Timpani, Strings, Triple Harps & Percussion).

- **🎹 内置 Web Audio 动机与主题合成器 (Theme & Motifs Synth Lab)**:
  - 无需下载庞大无损音频，浏览器内置 Web Audio API 振荡器即可直接试听四大乐章核心动机，并能一键模拟终曲尾声西方复调最高神迹——**四重对位（Quadruple Counterpoint）** 四条独立主题的同振共鸣！
  - Pure Web Audio synthesis of core themes and the legendary Quadruple Counterpoint summit in the Finale Coda.

- **⏱ 精准对齐君特·旺德权威录音 (Calibrated to Günter Wand / Robert Haas Edition)**:
  - 时间轴精确锚定君特·旺德指挥北德广播交响乐团（NDR）与柏林爱乐乐团（BPO）的宏伟建筑速度。
  - 完整呈现罗伯特·哈斯版（Robert Haas Edition）恢复的历史篇章：第三乐章慢板的三记石破天惊大钹爆鸣与终曲展开部的圣咏沉思。

- **📁 支持本地高码率音频加载与自由校准 (Local Audio Import & Calibration)**:
  - 可导入本地任何版本的 FLAC/WAV/MP3 音频，支持整体时间偏移与锚点微调。
  - Load your own audio files with custom time-stretching and anchor offset calibration.

---

## 🏛 结构概览 / Movement Architecture

| 乐章 | 标题 / Title | 调性 / Tonality | 速度 / Form | 旺德参考时长 | 核心看点 / Highlights |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **I** | Allegro moderato | C minor | 2/2 奏鸣曲式 | ~16:50 | 2+3布鲁克纳节奏、歌唱期双重对位、死亡时钟（Todesuhr） |
| **II** | Scherzo & Trio | C minor / Ab major | 3/4 & 2/4 复三部 | ~14:20 | 德意志米歇尔乡村踏地舞、阿尔卑斯黄昏、三把竖琴与瓦格纳大号首秀 |
| **III** | Adagio: Feierlich langsam | Db major | 4/4 五部交替变奏 | ~26:45 | 天国切分叹息、瓦格纳大号圣咏、哈斯版银河顶点（三记钹鸣与竖琴飞瀑） |
| **IV** | Finale: Feierlich, nicht schnell | C minor → C major | 2/2 史诗奏鸣曲式 | ~25:35 | 哥萨克骑兵冲锋、管风琴圣咏与长笛、**西方复调最高峰：四重对位终局** |

---

## 🚀 本地运行与部署 / Quick Start & Deployment

本项目为纯静态零构建架构（Zero-build Vanilla Web Application），无需 Node.js 或任何构建工具：

### 本地直接运行
在项目目录下启动任意静态 HTTP 服务器，或直接双击 `index.html`：
```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

### 部署到 GitHub Pages
1. 在 GitHub 个人账户下新建公开仓库 `bruckner-eight`
2. 推送本目录代码到仓库 `main` 分支
3. 访问仓库 `Settings` -> `Pages` -> Source 选择 `Deploy from a branch` (Branch: `main` / `/root`)，保存即可生成公网在线访问链接！

---

## 🎼 音乐学致谢 / Musicological References
- **Robert Haas (1939 Edition)**: Anton Bruckner, *Sämtliche Werke, Band 8: VIII. Symphonie c-moll (Fassung von 1890)*, Musikwissenschaftlicher Verlag der Internationalen Bruckner-Gesellschaft, Wien.
- **Günter Wand (1912–2002)**: *Bruckner Symphony No. 8* with NDR Sinfonieorchester (1987, Hamburg Musikhalle / 1992, Lübeck Cathedral) & Berliner Philharmoniker (2001, Philharmonie Berlin), RCA Red Seal.
- Curated by **MelonWater0421** with **Antigravity AI Pair Programmer**.
