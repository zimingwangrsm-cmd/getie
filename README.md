# 个贴 GeTie
**个性不止一贴。** 面向持续运营小红书和抖音的个人创作者与小团队。使用同一份素材分别创作两平台的图文，确认后同步共同事实，并用评论与发布反馈策划后续内容。

[在线体验「个贴」](https://resonance-studio-0qqk6t.fleet.aig.rest/?asteam_share=6721) · 分享码 **6721**

[产品终稿 PPT](presentations/product-pitch/个贴final.pptx) · [配套宣讲 PDF](presentations/product-pitch/个贴_产品宣讲.pdf)

## 本地运行
推荐 Python 3.12。网页服务使用标准库，前端无需构建。

```bash
cp .env.example .env
PORT=8000 python3 server.py
```

访问 http://localhost:8000 。内置葡萄牙、书桌与咖啡示例。使用实际生成需填写有权使用的模型配置。首次启动会创建本地数据库。创建管理账号可运行 `python3 scripts/provision_admin.py admin`。

## 主要功能
- 单平台生成、双平台联立、共同事实变更预览和分平台编辑。
- 三集系列策划、按集进入编辑器、从原评论生成候选调整。
- 表达档案、作品冻结、指标回填与导出。

## 分发范围
本仓库包含前后端、运行配置、产品样例、回归测试、宣讲材料和逐文件校验。原环境的内部运维与数据恢复文档、原始研究语料、Qilin 原帖及原图、私人数据库和凭据均未公开。本次公开版省略研究预测与历史语料诊断的实现和模型，以及资金收款、人工核账和相关管理接口。相应页面可能提示服务未启用；真实模型生成需要自行配置。产品示例和本地编辑仍可使用。未指定全项目开源许可。请保留演示材料自带的来源与字体说明。

## 检查
```bash
sha256sum -c SHA256SUMS
python3 -m unittest tests.showcase_checks tests.linked_checks tests.plans_checks
node --check public/app.js
node --check public/views.js
```
