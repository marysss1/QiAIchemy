# QiAIchemy

QiAIchemy = **Qi** (中医“气”) + **AI** + **Alchemy**（炼化/转化）。  
项目定位为一个融合中医养生知识与健康数据分析的 iOS 智能健康助手原型。

## 项目归属

- 本项目为 **中国传媒大学 苏梦榆** 本科毕业设计。  
- 项目性质：教学与研究用途，非商业项目。  
- 作者顺序：`Mengyu Su（算法和项目开发）` Primo Pan(HealthKit Bridge搭建） 。

## 项目意义

1. 探索“中医知识 + 可穿戴健康数据 + 生成式 AI”在个人健康管理中的结合方式。  
2. 面向中文语境和中国用户习惯，验证 AI 健康建议的可理解性与可执行性。  
3. 构建一个可用于毕业论文实验的真实交互原型，支持后续可用性评估与用户研究。

## 项目目标

1. 构建可在 iPhone 运行的移动端应用（React Native）。  
2. 在用户授权前提下读取健康数据（如步数、睡眠）。  
3. 支持饮食照片上传与日常生活记录。  
4. 基于中医知识库（RAG）提供生活方式建议。  
5. 用一个月周期观察用户习惯变化与主观生活质量改善趋势。

## 研究边界与声明

- 本项目为健康管理与生活方式建议工具，**不提供医疗诊断、处方或治疗方案**。  
- 用户数据采集遵循最小必要原则，必须经过明确授权。  
- 所有 AI 内容应明确标注并保留人工判断空间。

## 当前开发范围（MVP）

- 中国风登录页（已完成）  
- 健康数据权限与读取（计划）  
- 聊天对话页与建议输出（计划）  
- 饮食图片上传（计划）

## 技术栈

- React Native 0.84  
- TypeScript  
- iOS（Xcode + CocoaPods）  
- 后端与 RAG：待接入

## 快速开始

### 1) 环境准备

- Node.js（建议使用与 `package.json` engines 匹配的版本）  
- Xcode（iOS 开发）  
- Ruby + Bundler + CocoaPods

### 2) 安装依赖

```bash
npm install
bundle install
cd ios && bundle exec pod install && cd ..
```

### 3) 启动开发

```bash
npm start
npm run ios
```

### 4) 运行测试

```bash
npm test -- --watch=false --runInBand
```

## 目录说明

- `App.tsx`：当前主界面（登录页原型）  
- `ios/`：iOS 原生工程与 Pods 配置  
- `android/`：Android 工程（本阶段非重点）  
- `__tests__/`：基础渲染测试

## 后续计划

1. 接入 HealthKit（步数、睡眠）并完成授权流程。  
2. 接入后端 API 与中医知识 RAG 服务。  
3. 完成实验数据记录与导出模块。  
4. 准备 TestFlight 测试版本用于毕业设计实验。
