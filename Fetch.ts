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
			"Content-Type"?: "application/json" | "text/plain" | "application/x-www-form-urlencoded" | "multipart/form-data" | "application/octet-stream";
			Authorization?: string;
			[key: string]: string | undefined;
		};
		/** 请求体，对象会根据 Content-Type会自动序列化 如果不传会默认转成json  其他类型需要设置的相应类型*/
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
		public status?: number;
		public statusText?: string;
		public type?: "abort" | "timeout" | "network" | "parse" | "http";

		constructor(message: string, status?: number, statusText?: string, type?: FetchError["type"]) {
			super(message);
			this.name = "FetchError";
			this.status = status;
			this.statusText = statusText;
			this.type = type;
		}
	}

	/**
	 * 核心请求实现
	 * @param url 请求地址
	 * @param options 请求配置
	 */
	export async function request<T = any>(url: string, options: FetchOptions = {}): Promise<FetchResponse<T>> {
		return new Promise((resolve, reject) => {
			try {
				const xhr = new XMLHttpRequest();
				const method = (options.method || "GET").toUpperCase() as any;
				let finalUrl = url;
				if (options.params) {
					const queryParts: string[] = [];
					for (const [key, value] of Object.entries(options.params)) {
						if (value === undefined || value === null) continue;
						let v: any = value;
						if (v instanceof Date) v = v.toISOString();
						else if (typeof v === "object") v = JSON.stringify(v);
						if (Array.isArray(v)) {
							v.forEach(item => {
								const val = String(item);
								queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
							});
						} else {
							const val = String(v);
							queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
						}
					}
					if (queryParts.length) {
						finalUrl += (finalUrl.includes("?") ? "&" : "?") + queryParts.join("&");
					}
				}

				xhr.open(method, finalUrl, true);

				const respType = options.responseType || "text";
				if (respType === "json") xhr.responseType = "json";
				else if (respType === "blob") xhr.responseType = "blob";
				else if (respType === "arraybuffer") xhr.responseType = "arraybuffer";
				else xhr.responseType = "text";

				const timeout = options.timeout ?? 15000;
				if (timeout > 0) xhr.timeout = timeout;

				const requestHeaders: Record<string, string> = {};
				if (options.headers) {
					for (const [k, v] of Object.entries(options.headers)) {
						if (v !== undefined) requestHeaders[k.trim()] = String(v).trim();
					}
				}

				let requestBody: any = options.body;
				if (method === "GET" || method === "HEAD") {
					requestBody = null;
				}
				const isFormData = requestBody instanceof FormData;
				const isBlob = requestBody instanceof Blob;
				if (requestBody && !isFormData && !isBlob && typeof requestBody === "object") {
					const ct = requestHeaders["Content-Type"] || "application/json";
					requestHeaders["Content-Type"] = ct;
					if (ct.includes("application/x-www-form-urlencoded")) {
						requestBody = new URLSearchParams(requestBody).toString();
					} else if (ct.includes("application/json")) {
						requestBody = JSON.stringify(requestBody);
					}
				}
				if (!isFormData) {
					for (const [k, v] of Object.entries(requestHeaders)) {
						if (k && v) xhr.setRequestHeader(k, v);
					}
				}
				let abortHandler: (() => void) | null = null;
				if (options.signal) {
					if (options.signal.aborted) {
						return reject(new FetchError("Request Aborted", 0, undefined, "abort"));
					}
					abortHandler = () => {
						xhr.abort();
						reject(new FetchError("Request Aborted", 0, undefined, "abort"));
					};
					options.signal.addEventListener("abort", abortHandler);
				}

				if (options.onDownloadProgress) xhr.onprogress = options.onDownloadProgress;
				if (options.onUploadProgress) xhr.upload.onprogress = options.onUploadProgress;

				xhr.onload = () => {
					try {
						if (abortHandler && options.signal) {
							options.signal.removeEventListener("abort", abortHandler);
						}
						const headerMap: Record<string, string> = {};
						const rawHeaders = xhr.getAllResponseHeaders().trim();
						if (rawHeaders) {
							rawHeaders.split(/[\r\n]+/).forEach(line => {
								const idx = line.indexOf(": ");
								if (idx <= 0) return;
								const key = line.slice(0, idx).trim().toLowerCase();
								const val = line.slice(idx + 2).trim();
								headerMap[key] = val;
							});
						}
						const response: FetchResponse<T> = {
							ok: xhr.status >= 200 && xhr.status < 300,
							status: xhr.status,
							statusText: xhr.statusText,
							url: xhr.responseURL || finalUrl,
							headers: {
								keys: () => Object.keys(headerMap),
								entries: () => Object.entries(headerMap),
								get: name => headerMap[name.trim().toLowerCase()] ?? null,
								has: name => name.trim().toLowerCase() in headerMap,
							},
							text: () => Promise.resolve(xhr.responseText || ""),
							blob: () => Promise.resolve(xhr.response instanceof Blob ? xhr.response : new Blob([xhr.responseText || ""])),
							arrayBuffer: () =>
								new Promise((res, rej) => {
									try {
										const blob = new Blob([xhr.response || xhr.responseText]);
										blob.arrayBuffer().then(res).catch(rej);
									} catch (e) {
										rej(e);
									}
								}),
							json: async () => {
								try {
									if (xhr.responseType === "json") return xhr.response;
									const t = xhr.responseText || "";
									return t ? JSON.parse(t) : null;
								} catch (e) {
									throw new FetchError("JSON Parse Failed", xhr.status, xhr.statusText, "parse");
								}
							},
						};
						if (response.ok) resolve(response);
						else reject(new FetchError(`HTTP ${xhr.status}`, xhr.status, xhr.statusText, "http"));
					} catch (e) {
						reject(e);
					}
				};
				xhr.onerror = () => {
					reject(new FetchError("Network Error", 0, undefined, "network"));
				};
				xhr.ontimeout = () => {
					reject(new FetchError("Request Timeout", 408, undefined, "timeout"));
				};
				xhr.send(requestBody ?? null);
			} catch (e) {
				reject(e);
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
	export const Post = <T = any>(url: string, options?: Omit<FetchOptions, "method">) => request<T>(url, { method: "POST", ...options });

	/**
	 * 发起 PUT 请求
	 */
	export const Put = <T = any>(url: string, options?: Omit<FetchOptions, "method">) => request<T>(url, { method: "PUT", ...options });

	/**
	 * 发起 PATCH 请求
	 */
	export const Patch = <T = any>(url: string, options?: Omit<FetchOptions, "method">) => request<T>(url, { method: "PATCH", ...options });

	/**
	 * 发起 DELETE 请求
	 */
	export const Delete = <T = any>(url: string, options?: Omit<FetchOptions, "method">) => request<T>(url, { method: "DELETE", ...options });
}

export default Fetch;
