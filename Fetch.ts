/**
 * HTTP 请求工具库
 * 基于 XMLHttpRequest 封装，提供 Promise 支持和类型定义
 */
export namespace Fetch {
	/** HTTP 请求方法 */
	export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

	/** 响应数据类型 */
	export type ResponseType = "text" | "json" | "blob" | "arraybuffer";

	/** 常见 Content-Type */
	export type ContentType =
		| "application/json"
		| "text/plain"
		| "application/x-www-form-urlencoded"
		| "multipart/form-data"
		| "application/octet-stream";

	/** 查询参数单个值类型 */
	export type ParamValue = string | number | boolean | string[] | number[] | undefined | null;

	/** 查询参数对象 */
	export type QueryParams = Record<string, ParamValue>;

	/** 请求头定义 */
	export interface FetchHeaders {
		"Content-Type"?: ContentType | string;
		Authorization?: string;
		[key: string]: string | undefined;
	}

	/** 请求配置 */
	export interface FetchOptions {
		/** HTTP 方法，默认 GET */
		method?: HttpMethod;
		/** 请求头 */
		headers?: FetchHeaders;
		/** 请求体，对象会根据 Content-Type 自动序列化 */
		body?: any;
		/** 超时时间，单位毫秒，默认 15000ms */
		timeout?: number;
		/** 响应数据类型，默认按 json 处理 */
		responseType?: ResponseType;
		/** URL 查询参数，自动拼接到 URL */
		params?: QueryParams;
		/** 取消请求信号，配合 AbortController 使用 */
		signal?: AbortSignal;
		/** 下载进度回调 */
		onDownloadProgress?: (event: ProgressEvent) => void;
		/** 上传进度回调 */
		onUploadProgress?: (event: ProgressEvent) => void;
	}

	/** 响应头操作接口 */
	export interface ResFetchHeaders {
		keys: () => string[];
		entries: () => [string, string | null][];
		get: (name: string) => string | null;
		has: (name: string) => boolean;
	}

	/** 响应对象接口 */
	export interface FetchResponse<T = any> {
		ok: boolean;
		status: number;
		statusText: string;
		url: string;
		text: () => Promise<string>;
		json: () => Promise<T>;
		blob: () => Promise<Blob>;
		arrayBuffer: () => Promise<ArrayBuffer>;
		headers: ResFetchHeaders;
	}

	/** 请求错误类，携带 HTTP 状态码信息 */
	export class FetchError extends Error {
		status?: number;
		statusText?: string;

		constructor(message: string, status?: number, statusText?: string) {
			super(message);
			this.name = "FetchError";
			this.status = status;
			this.statusText = statusText;
		}
	}

	/**
	 * 核心请求实现
	 * @param url 请求地址
	 * @param options 请求配置
	 */
	export async function request<T = any>(url: string, options: FetchOptions = {}): Promise<FetchResponse<T>> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			const method = options.method || "GET";

			// 构建查询字符串，拼接到 URL
			let finalUrl = url;
			if (options.params) {
				const queryParts: string[] = [];
				for (const [key, value] of Object.entries(options.params)) {
					if (value === undefined || value === null) continue;
					if (Array.isArray(value)) {
						// 数组参数展开为多个同名键
						value.forEach((v: string | number | boolean) => queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
					} else {
						queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value as string | number | boolean)}`);
					}
				}
				if (queryParts.length > 0) {
					finalUrl += (finalUrl.includes("?") ? "&" : "?") + queryParts.join("&");
				}
			}

			xhr.open(method, finalUrl, true);
			xhr.timeout = options.timeout ?? 15000;

			// json 由手动解析处理，不设置 xhr.responseType
			if (options.responseType && options.responseType !== "json") {
				xhr.responseType = options.responseType;
			}

			// 过滤掉值为 undefined 的请求头
			const requestHeaders: Record<string, string> = {};
			for (const [key, val] of Object.entries(options.headers || {})) {
				if (val !== undefined) requestHeaders[key] = val;
			}

			// 根据 Content-Type 自动序列化请求体
			let requestBody = options.body;
			if (requestBody && typeof requestBody === "object" && !(requestBody instanceof FormData) && !(requestBody instanceof Blob)) {
				const ct = requestHeaders["Content-Type"] || "";
				if (ct.includes("application/x-www-form-urlencoded")) {
					// 表单格式：key=value&key2=value2
					requestBody = Object.entries(requestBody)
						.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as any)}`)
						.join("&");
				} else {
					// 默认 JSON 序列化
					requestBody = JSON.stringify(requestBody);
					if (!requestHeaders["Content-Type"]) {
						requestHeaders["Content-Type"] = "application/json";
					}
				}
			}

			// 设置请求头
			for (const [key, val] of Object.entries(requestHeaders)) {
				if (val) xhr.setRequestHeader(key, val);
			}

			// 取消请求支持
			if (options.signal) {
				if (options.signal.aborted) {
					reject(new FetchError("Request Aborted", 0));
					return;
				}
				options.signal.addEventListener("abort", () => {
					xhr.abort();
					reject(new FetchError("Request Aborted", 0));
				});
			}

			// 进度回调
			if (options.onDownloadProgress) xhr.onprogress = options.onDownloadProgress;
			if (options.onUploadProgress) xhr.upload.onprogress = options.onUploadProgress;

			xhr.onload = () => {
				// 解析响应头为 Map
				const responseHeadersMap: Record<string, string> = {};
				xhr.getAllResponseHeaders()
					.trim()
					.split(/[\r\n]+/)
					.forEach(line => {
						const idx = line.indexOf(": ");
						if (idx !== -1) {
							responseHeadersMap[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
						}
					});

				const response: FetchResponse<T> = {
					ok: xhr.status >= 200 && xhr.status < 300,
					status: xhr.status,
					statusText: xhr.statusText,
					url: xhr.responseURL || finalUrl,
					headers: {
						keys: () => Object.keys(responseHeadersMap),
						entries: () => Object.entries(responseHeadersMap),
						get: name => responseHeadersMap[name.toLowerCase()] ?? null,
						has: name => name.toLowerCase() in responseHeadersMap,
					},
					text: () => Promise.resolve(xhr.responseText || ""),
					blob: () => Promise.resolve(xhr.response instanceof Blob ? xhr.response : new Blob([xhr.response])),
					arrayBuffer: () => Promise.resolve(xhr.response),
					json: async () => {
						const text = xhr.responseText;
						if (!text) return null as T;
						try {
							return JSON.parse(text) as T;
						} catch {
							throw new FetchError("Failed to parse JSON", xhr.status, xhr.statusText);
						}
					},
				};

				if (response.ok) {
					resolve(response);
				} else {
					reject(new FetchError(`HTTP Error: ${xhr.status}`, xhr.status, xhr.statusText));
				}
			};

			xhr.onerror = () => reject(new FetchError("Network Error", 0));
			xhr.ontimeout = () => reject(new FetchError("Request Timeout", 408));

			xhr.send(requestBody ?? null);
		});
	}

	/**
	 * 发起 GET 请求
	 */
	export const Get = <T = any>(url: string, options?: Omit<FetchOptions, "method" | "body">) => request<T>(url, { method: "GET", ...options });

	/**
	 * 发起 POST 请求，body 为对象时自动按 Content-Type 序列化
	 */
	export const Post = <T = any>(url: string, options?: Omit<FetchOptions, "method" | "params">) => request<T>(url, { method: "POST", ...options });

	/**
	 * 发起 PUT 请求
	 */
	export const Put = <T = any>(url: string, options?: Omit<FetchOptions, "method" | "params">) => request<T>(url, { method: "PUT", ...options });

	/**
	 * 发起 PATCH 请求
	 */
	export const Patch = <T = any>(url: string, options?: Omit<FetchOptions, "method" | "params">) =>
		request<T>(url, { method: "PATCH", ...options });

	/**
	 * 发起 DELETE 请求
	 */
	export const Delete = <T = any>(url: string, options?: Omit<FetchOptions, "method" | "params">) =>
		request<T>(url, { method: "DELETE", ...options });
}

export default Fetch;
