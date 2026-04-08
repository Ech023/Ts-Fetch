# Fetch.ts

基于 `XMLHttpRequest` 封装的 HTTP 请求工具库，提供 Promise 支持与完整的 TypeScript 类型定义。

## 灵感来源

本模块的设计借鉴了 [unfetch](https://github.com/developit/unfetch) —— 一个轻量级的 `fetch` polyfill，由 [Jason Miller (developit)](https://github.com/developit) 开发。

## 特性

- 支持 `GET` / `POST` / `PUT` / `PATCH` / `DELETE` 等常用 HTTP 方法
- 自动根据 `Content-Type` 序列化请求体（JSON / 表单）
- 支持 URL 查询参数自动拼接（`params`）
- 支持请求超时（默认 15000ms）
- 支持取消请求（`AbortSignal`）
- 支持上传 / 下载进度回调
- 响应头封装为统一接口（`get` / `has` / `keys` / `entries`）

## 类型定义

| 类型 | 说明 |
|------|------|
| `HttpMethod` | HTTP 请求方法联合类型 |
| `ResponseType` | 响应数据类型 |
| `ContentType` | 常见 Content-Type 枚举 |
| `QueryParams` | URL 查询参数对象 |
| `FetchOptions` | 请求配置项 |
| `FetchResponse<T>` | 响应对象接口 |
| `FetchError` | 请求错误类，携带 `status` / `statusText` |

## 使用示例

```ts
import Fetch from "./Fetch";

// GET 请求
const res = await Fetch.Get("https://api.example.com/users", {
  params: { page: 1, size: 10 },
});
const data = await res.json();

// POST JSON
const res2 = await Fetch.Post("https://api.example.com/login", {
  headers: { "Content-Type": "application/json" },
  body: { username: "[name]", password: "[password]" },
});

// POST 表单
const res3 = await Fetch.Post("https://api.example.com/login", {
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: { phone: "[phone_number]", pwd: "[password]" },
});

// 取消请求
const controller = new AbortController();
Fetch.Get("https://api.example.com/data", { signal: controller.signal });
controller.abort();
```

## 许可

使用时请遵守 [unfetch](https://github.com/developit/unfetch) 的开源许可协议（MIT）。
