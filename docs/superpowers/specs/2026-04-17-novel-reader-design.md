# Novel Reader H5 App — 设计文档

**日期：** 2026-04-17  
**状态：** 已确认

---

## 概述

个人使用的 H5 小说阅读器。支持输入任意小说网站 URL，自动抓取并解析章节内容，以移动端阅读器形式展示。

---

## 目标与约束

- **用户**：个人使用，无多用户需求
- **平台**：H5（移动端浏览器）
- **技术栈**：Vanilla HTML/CSS/JS（前端）+ Node.js Express（后端）
- **持久化**：localStorage（书籍列表 + 阅读进度）
- **核心问题**：浏览器跨域限制，需后端代理

---

## 架构

```
前端 (Vanilla HTML/CSS/JS)
├── index.html        书架页
├── chapters.html     章节列表页
└── reader.html       阅读器页

后端 (Node.js + Express)
└── GET /proxy?url=   唯一接口，转发 HTTP 请求

存储
└── localStorage      书籍元数据 + 每本书当前章节
```

---

## 数据流

1. 用户在书架页输入目录 URL
2. 前端调 `/proxy?url=<encoded>` → 后端抓取 HTML → 返回原始 HTML
3. 前端用 **Mozilla Readability.js** 自动提取章节列表 / 正文
4. 识别失败时，用户可手填 CSS 选择器覆盖，重新解析
5. 用户点击章节 → 同样走代理 + 解析流程
6. 每次翻页记录当前章节 URL 到 localStorage

---

## 页面详情

### 书架页（index.html）

- 展示已添加书籍卡片：书名、当前阅读章节、最后阅读时间
- "添加新书"按钮展开输入框，粘贴目录页 URL
- 点击书籍卡片 → 直接跳转到上次阅读章节

### 章节列表页（chapters.html）

- 展示从目录页解析出的章节列表
- 支持滚动，高亮当前阅读章节
- 点击章节跳转阅读器页

### 阅读器页（reader.html）

- **顶部进度条**：当前页面滚动进度（细线，金色）
- **导航栏**：← 书架 | 书名 | 目录 ☰
- **正文区**：米色背景，衬线字体，行距 1.9，首行缩进
- **底部工具栏**：
  - 上一章 / 当前章节 x/总章 / 下一章
  - A− / A+（字体大小，存 localStorage）
  - ☾ 日/夜切换（米色 ↔ 深色）
  - ⚙ CSS 选择器配置（弹窗，手填内容区选择器 + 章节列表选择器）
- **目录侧滑面板**：点击"目录 ☰"从左侧滑出，列出所有章节，当前章节高亮

---

## 后端 API

### `GET /proxy`

| 参数 | 说明 |
|------|------|
| `url` | 目标页面 URL（URL 编码） |

- 后端用 `axios` 或 `node-fetch` 抓取目标 URL
- 透传响应内容（HTML 字符串）
- 处理 gzip 解压、编码转换（gbk → utf-8）
- 不做缓存（个人使用，简单优先）
- 错误响应：目标站不可达/超时/非 200 时返回 HTTP 502 + JSON `{ "error": "..." }`
- 仅监听 localhost，不对外暴露

---

## 内容解析策略

| 场景 | 策略 |
|------|------|
| 正文提取 | 先用 Readability.js 自动识别 |
| 章节列表提取 | 用启发式规则：找页面中链接最密集的 `<ul>/<div>`，过滤导航链接 |
| 识别失败 | 用户手填 CSS 选择器，存入该书的配置（localStorage） |
| 章节列表启发式 | 排除 `<nav>` 元素及文字匹配"首页/登录/注册/搜索"的链接 |

---

## 存储结构（localStorage）

```json
// key: "novel_shelf"
[
  {
    "id": "uuid",
    "title": "斗破苍穹",
    "indexUrl": "https://...",
    "currentChapterUrl": "https://...",
    "currentChapterTitle": "第342章",
    "lastRead": "2026-04-17T10:00:00Z",
    "selectors": {
      "content": "",
      "chapterList": ""
    }
  }
]
```

---

## 主题与样式

- **米色主题**（默认）：背景 `#f5f0e8`，文字 `#3a3028`，强调色 `#8b6914`
- **夜间主题**：背景 `#1a1a1a`，文字 `#c8c8c8`，强调色 `#e94560`
- 字体：衬线字体（Georgia / 宋体 fallback）
- 字体大小范围：14px – 22px，步进 2px

---

## 项目结构

```
novel-reader/
├── frontend/
│   ├── index.html
│   ├── chapters.html
│   ├── reader.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── shelf.js
│       ├── chapters.js
│       ├── reader.js
│       └── storage.js
├── backend/
│   ├── server.js
│   └── package.json
└── .gitignore
```

---

## 依赖

- **Readability.js**：本地打包（不走 CDN），避免网络依赖
- **后端**：`express` + `axios` + `iconv-lite`（编码转换）

---

## 不在范围内

- 用户账号/登录
- 云端同步
- 搜索功能
- 书签（仅进度）
- PWA/离线缓存
