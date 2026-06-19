/**
 * Minimal Strapi Content API client (Strapi 5, documentId-based REST).
 */

export type StrapiStatus = "draft" | "published";

export interface StrapiListResponse<T> {
  data: T[];
  meta?: { pagination?: { pageSize?: number; pageCount?: number; total?: number } };
}

export interface StrapiDocument {
  id?: number;
  documentId: string;
  locale?: string;
  publishedAt?: string | null;
  [key: string]: unknown;
}

export class StrapiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string
  ) {}

  private url(path: string, query?: URLSearchParams): string {
    const base = this.baseUrl.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    const qs = query?.toString();
    return qs ? `${base}${p}?${qs}` : `${base}${p}`;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private withStatus(params: URLSearchParams, status?: StrapiStatus): URLSearchParams {
    if (status) params.set("status", status);
    return params;
  }

  async ping(contentTypePlural: string): Promise<{ ok: boolean; total?: number; error?: string }> {
    try {
      const params = new URLSearchParams({ "pagination[pageSize]": "1" });
      const res = await fetch(this.url(`/api/${contentTypePlural}`, params), {
        headers: this.headers(),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `${res.status} ${res.statusText}: ${text.slice(0, 200)}` };
      }
      const json = (await res.json()) as StrapiListResponse<StrapiDocument>;
      return { ok: true, total: json.meta?.pagination?.total };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async list(
    contentTypePlural: string,
    opts?: {
      pageSize?: number;
      page?: number;
      sort?: string;
      locale?: string;
      status?: StrapiStatus;
      filters?: Record<string, string>;
    }
  ): Promise<{ data: StrapiDocument[]; total?: number }> {
    const params = new URLSearchParams({
      "pagination[pageSize]": String(opts?.pageSize ?? 25),
      "pagination[page]": String(opts?.page ?? 1),
    });
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.locale) params.set("locale", opts.locale);
    this.withStatus(params, opts?.status);
    for (const [field, value] of Object.entries(opts?.filters ?? {})) {
      params.set(`filters[${field}][$eq]`, value);
    }
    const res = await fetch(this.url(`/api/${contentTypePlural}`, params), {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`list failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as StrapiListResponse<StrapiDocument>;
    return { data: json.data, total: json.meta?.pagination?.total };
  }

  async listAll(
    contentTypePlural: string,
    opts?: {
      sort?: string;
      locale?: string;
      status?: StrapiStatus;
      filters?: Record<string, string>;
      pageSize?: number;
    }
  ): Promise<StrapiDocument[]> {
    const pageSize = opts?.pageSize ?? 100;
    const all: StrapiDocument[] = [];
    let page = 1;
    let total = Infinity;
    while (all.length < total) {
      const { data, total: t } = await this.list(contentTypePlural, {
        ...opts,
        page,
        pageSize,
      });
      if (t != null) total = t;
      if (data.length === 0) break;
      all.push(...data);
      page++;
      if (data.length < pageSize) break;
    }
    return all;
  }

  async findOne(
    contentTypePlural: string,
    filters: Record<string, string>,
    opts?: { locale?: string; status?: StrapiStatus }
  ): Promise<StrapiDocument | null> {
    const params = new URLSearchParams({ "pagination[pageSize]": "1" });
    for (const [field, value] of Object.entries(filters)) {
      params.set(`filters[${field}][$eq]`, value);
    }
    if (opts?.locale) params.set("locale", opts.locale);
    this.withStatus(params, opts?.status);
    const res = await fetch(this.url(`/api/${contentTypePlural}`, params), {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`findOne failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as StrapiListResponse<StrapiDocument>;
    return json.data[0] ?? null;
  }

  async create(
    contentTypePlural: string,
    data: Record<string, unknown>,
    opts?: { locale?: string; status?: StrapiStatus }
  ): Promise<StrapiDocument> {
    const params = new URLSearchParams();
    if (opts?.locale) params.set("locale", opts.locale);
    this.withStatus(params, opts?.status ?? "draft");
    const res = await fetch(this.url(`/api/${contentTypePlural}`, params), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      throw new Error(`create failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { data: StrapiDocument };
    return json.data;
  }

  async update(
    contentTypePlural: string,
    documentId: string,
    data: Record<string, unknown>,
    opts?: { locale?: string; status?: StrapiStatus }
  ): Promise<StrapiDocument> {
    const params = new URLSearchParams();
    if (opts?.locale) params.set("locale", opts.locale);
    this.withStatus(params, opts?.status ?? "draft");
    const res = await fetch(this.url(`/api/${contentTypePlural}/${documentId}`, params), {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      throw new Error(`update failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { data: StrapiDocument };
    return json.data;
  }

  async getDocument(
    contentTypePlural: string,
    documentId: string,
    opts: { locale: string; status?: StrapiStatus }
  ): Promise<StrapiDocument | null> {
    const params = new URLSearchParams({ locale: opts.locale });
    this.withStatus(params, opts.status ?? "draft");
    const res = await fetch(this.url(`/api/${contentTypePlural}/${documentId}`, params), {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`getDocument failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { data: StrapiDocument | null };
    return json.data ?? null;
  }

  /** Publish the draft locale version (Strapi 5 Content API). */
  async publishLocale(
    contentTypePlural: string,
    documentId: string,
    locale: string
  ): Promise<StrapiDocument> {
    const draft = await this.getDocument(contentTypePlural, documentId, {
      locale,
      status: "draft",
    });

    const data: Record<string, unknown> = {};
    if (draft) {
      const metadata = new Set([
        "id",
        "documentId",
        "locale",
        "publishedAt",
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
        "localizations",
        "status",
      ]);
      for (const [key, value] of Object.entries(draft)) {
        if (metadata.has(key)) continue;
        if (value != null && value !== "") data[key] = value;
      }
    }

    const params = new URLSearchParams({ locale, status: "published" });
    const res = await fetch(this.url(`/api/${contentTypePlural}/${documentId}`, params), {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      throw new Error(`publish failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { data: StrapiDocument };
    return json.data;
  }

  async delete(
    contentTypePlural: string,
    documentId: string,
    opts?: { locale?: string; status?: StrapiStatus }
  ): Promise<void> {
    const params = new URLSearchParams();
    if (opts?.locale) params.set("locale", opts.locale);
    // Strapi 5 returns 500 when status=draft is passed on DELETE; locale-only works.
    if (opts?.status && opts.status !== "draft") this.withStatus(params, opts.status);
    const res = await fetch(this.url(`/api/${contentTypePlural}/${documentId}`, params), {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`delete failed (${res.status}): ${await res.text()}`);
    }
  }
}
