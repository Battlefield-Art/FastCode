# FastCode v1

This directory is the complete source of FastCode before it became TokenWise, frozen on **2026-11-23**. The source commit is recorded in [RELEASE.json](RELEASE.json). TokenWise continues at the [repository root](../README.md).

此目录是 FastCode 升级为 TokenWise 之前的**完整源码归档**。代码、配置模板、Docker 文件、nanobot 集成与文档均保留在此目录中；源提交记录在 [RELEASE.json](RELEASE.json)。TokenWise 在[仓库根目录](../README.md)继续开发。

## Install and run / 安装运行

Run FastCode from this directory, following its [README](README.md):

在此目录中按归档内的 [README](README.md) 安装运行：

```bash
cd FastCode
pip install -r requirements.txt
cp env.example .env    # add your API keys
python web_app.py --host 0.0.0.0 --port 5000
```

## Contents and integrity / 内容与校验

The archive holds all 121 Git-tracked files of the source commit, unchanged except for a notice at the top of README.md. [SHA256SUMS](SHA256SUMS) covers every archived file; verify from this directory with `sha256sum -c SHA256SUMS` (macOS: `shasum -a 256 -c SHA256SUMS`).

归档包含源提交中全部受版本控制的文件，除 README.md 顶部的说明外未作改动。[SHA256SUMS](SHA256SUMS) 覆盖每个归档文件。

## Maintenance / 维护约定

Treat this directory as a frozen release; new work happens at the repository root. If a v1 correction is necessary, record it in RELEASE.json and regenerate SHA256SUMS.

此目录作为冻结版本保留，新功能在仓库根目录进行。若确需修正归档，请在 RELEASE.json 中记录并更新校验清单。
