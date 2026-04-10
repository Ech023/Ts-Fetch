/**
 * HTTP 请求工具库
 * 基于 XMLHttpRequest 封装，提供 Promise 支持和类型定义
 */
export namespace Fetch {
	/** 请求配置 */
	export interface FetchOptions {
		/** HTTP 方法，默认 GET */
		method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
		/** 请求头 */
		headers?: {
			"Content-Type"?:
				| "application/json"
				| "text/plain"
				| "application/x-www-form-urlencoded"
				| "multipart/form-data"
				| "application/octet-stream";
			Authorization?: string;
			[key: string]: string | undefined;
		};
		/** 请求体，对象会根据 Content-Type 自动序列化 */
		body?: any;
		/** 超时时间，单位毫秒，默认 15000ms */
		timeout?: number;
		/** 响应数据类型，默认按 json 处理 */
		responseType?: "text" | "json" | "blob" | "arraybuffer";
		/** URL 查询参数，自动拼接到 URL */
		params?: Record<string, unknown>;
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
		entries: () => [string, string][];
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
			// 创建 XMLHttpRequest 实例
			const xhr = new XMLHttpRequest();
			// 获取请求方法，默认 GET
			const method = options.method || "GET";
			let finalUrl: string = "";
			// 处理 URL 查询参数
			let baseUrl = url;
			if (options.params) {
				const queryParts: string[] = [];
				for (const [key, value] of Object.entries(options.params)) {
					// 跳过 undefined 和 null
					if (value === undefined || value === null) continue;
					if (Array.isArray(value)) {
						// 数组参数展开为多个同名键
						value.forEach((v: string | number | boolean) =>
							queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`),
						);
					} else {
						queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
					}
				}
				if (queryParts.length > 0) {
					// 如果 URL 已有查询参数，则用 & 连接，否则用 ? 连接
					baseUrl += (baseUrl.includes("?") ? "&" : "?") + queryParts.join("&");
				}
			}
			finalUrl = baseUrl;

			// 初始化请求
			xhr.open(method, finalUrl, true);

			// 设置响应类型
			const responseType = options.responseType || "text";
			xhr.responseType = responseType as XMLHttpRequestResponseType;

			// 设置超时时间
			xhr.timeout = options.timeout ?? 15000;

			// 处理请求头
			const requestHeaders: Record<string, string> = {};
			for (const [key, val] of Object.entries(options.headers || {})) {
				if (val !== undefined) requestHeaders[key] = String(val);
			}

			// 处理请求体
			let requestBody = options.body;
			// 只有非 GET/HEAD 请求才处理请求体
			if (requestBody && method !== "GET" && method !== "HEAD") {
				if (requestBody instanceof FormData || requestBody instanceof Blob) {
					// 如果是 FormData 或 Blob 对象，不设置 Content-Type
					if (requestHeaders["Content-Type"]) {
						delete requestHeaders["Content-Type"];
					}
				} else if (typeof requestBody === "object" && requestBody !== null) {
					// 如果是普通对象，根据 Content-Type 进行序列化
					const contentType = requestHeaders["Content-Type"] || "application/json";
					// 如果没有设置 Content-Type，则设置默认值
					if (!requestHeaders["Content-Type"]) {
						requestHeaders["Content-Type"] = contentType;
					}
					// 根据 Content-Type 进行序列化
					if (contentType.includes("application/x-www-form-urlencoded")) {
						requestBody = Object.entries(requestBody)
							.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
							.join("&");
					} else if (contentType.includes("application/json")) {
						requestBody = JSON.stringify(requestBody);
					}
				}
			}

			// 设置请求头（如果是 FormData 不设置任何请求头，浏览器会自动设置）
			if (!(requestBody instanceof FormData)) {
				for (const [key, val] of Object.entries(requestHeaders)) {
					if (val) xhr.setRequestHeader(key, val);
				}
			}

			// 处理请求取消信号
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

			// 设置进度回调
			if (options.onDownloadProgress) xhr.onprogress = options.onDownloadProgress;
			if (options.onUploadProgress) xhr.upload.onprogress = options.onUploadProgress;

			// 请求完成回调
			xhr.onload = () => {
				// 解析响应头
				const responseHeadersMap: Record<string, string> = {};
				xhr.getAllResponseHeaders()
					.trim()
					.split(/[\r\n]+/)
					.forEach(line => {
						const idx = line.indexOf(": ");
						if (idx !== -1) {
							const headerName = line.slice(0, idx).toLowerCase().trim();
							const headerValue = line.slice(idx + 2).trim();
							responseHeadersMap[headerName] = headerValue;
						}
					});

				// 构建响应对象
				const response: FetchResponse<T> = {
					ok: xhr.status >= 200 && xhr.status < 300,
					status: xhr.status,
					statusText: xhr.statusText,
					url: xhr.responseURL || finalUrl,
					headers: {
						keys: () => Object.keys(responseHeadersMap),
						entries: () => Object.entries(responseHeadersMap),
						get: name => responseHeadersMap[name.toLowerCase().trim()] ?? null,
						has: name => name.toLowerCase().trim() in responseHeadersMap,
					},
					text: () => Promise.resolve(xhr.responseText || ""),
					blob: () => {
						// 如果已经是 Blob 对象，直接返回
						if (xhr.response instanceof Blob) {
							return Promise.resolve(xhr.response);
						} else if (xhr.responseType === "blob") {
							return Promise.resolve(xhr.response);
						} else {
							// 否则从响应数据创建 Blob
							return Promise.resolve(new Blob([xhr.response]));
						}
					},
					arrayBuffer: async () => {
						if (xhr.responseType === "arraybuffer") {
							return Promise.resolve(xhr.response);
						} else {
							// 从 Blob 获取 ArrayBuffer
							const blob = await response.blob();
							return blob.arrayBuffer();
						}
					},
					json: async () => {
						// 如果设置了 json 响应类型，直接返回
						if (xhr.responseType === "json") {
							return Promise.resolve(xhr.response);
						}
						// 否则从文本解析
						const text = xhr.responseText;
						if (!text) return null as T;
						try {
							return JSON.parse(text) as T;
						} catch {
							throw new FetchError("Failed to parse JSON", xhr.status, xhr.statusText);
						}
					},
				};

				// 根据 HTTP 状态码决定 resolve 或 reject
				if (response.ok) {
					resolve(response);
				} else {
					reject(new FetchError(`HTTP Error: ${xhr.status} ${xhr.statusText}`, xhr.status, xhr.statusText));
				}
			};

			// 网络错误回调
			xhr.onerror = () => reject(new FetchError("Network Error", 0));
			// 超时错误回调
			xhr.ontimeout = () => reject(new FetchError("Request Timeout", 408));

			// 发送请求
			// GET 和 HEAD 请求不应有请求体
			if (method === "GET" || method === "HEAD") {
				xhr.send(null);
			} else {
				xhr.send(requestBody ?? null);
			}
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
