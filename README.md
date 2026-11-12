# LevelUp英语

微信小程序：分级英语阅读 + 听力 + 生词本。参考 Level Read 的分级阅读模式。

## 功能

- **分级阅读**：L1/L2/L3 三个难度等级，AI 按话题生成英文短文（含中文标题与全文翻译）
- **听全文**：内置英文朗读音频（文章详情页 🔊 一键播放），首页有"可听"标记
- **点词释义**：正文逐词可点，LLM 即时给出中文释义，一键加入生词本
- **生词本**：云端保存，跨设备同步，记录来源文章
- **个人中心**：学习统计、邮箱验证码登录

## 预置内容

6 篇「日常生活」分类文章（每级 2 篇），由 macOS `say`（Samantha 声音，175 wpm）生成本地朗读音频，位于 `audio/`（.aac，总计约 1MB）。

## 技术栈

- 原生微信小程序（无框架）
- WorkBuddy Cloud Service：云数据库（PostgreSQL + RLS 行级安全）、用户认证（邮箱 OTP）、免密钥 LLM API
- SDK：`@tencent-ai/workbuddy-cloud-sdk`（`/miniprogram` 子路径）

## 数据表

| 表 | 权限 | 用途 |
|---|---|---|
| `articles` | 所有人可读，登录用户可插入 | 分级文章（`audio` 列指向内置音频路径） |
| `words` | 仅本人可读写 | 生词本 |
| `speaking_sessions` | 仅本人可读写 | 口语练习记录（当前版本未启用，保留） |

## 本地开发

```bash
npm install          # 安装云 SDK
```

用微信开发者工具打开本目录即可预览（真实 API 请求需在工具中开启「不校验合法域名」或先发布）。

## 目录结构

```
├── app.js / app.json / app.wxss   # 应用入口与 tabBar 配置（阅读/生词本/我的）
├── audio/          # 文章朗读音频（.aac）
├── pages/
│   ├── index/       # 分级阅读首页
│   ├── article/     # 文章详情（点词释义 + 听全文）
│   ├── words/       # 生词本
│   └── profile/     # 个人中心
├── components/login-panel/        # 邮箱验证码登录组件
├── utils/
│   ├── cloud.js                  # 云客户端（唯一实例）
│   ├── workbuddy-data-access.js  # 数据访问封装
│   └── workbuddy-cloud-diagnostics.js  # 请求诊断
└── icons/          # tabBar 图标
```
