import { firefox, Browser, BrowserContext } from 'playwright';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import { convert as htmlToText } from 'html-to-text';
import { logger } from '../shared/logger.js';

function stripHtml(html: string): string {
  return htmlToText(html, { wordwrap: false });
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };

export class WebResearchTool {
  private browser: Browser | null = null;
  private browserContext: BrowserContext | null = null;
  private browserInitPromise: Promise<void> | null = null;
  private browserProxyUrl: string | undefined;
  private browserUserAgent: string | undefined;
  private browserHeadless: boolean = true;
  private newsCache = new Map<
    string,
    {
      expiresAtMs: number;
      value: Array<{
        title: string;
        url: string;
        snippet?: string;
        source?: string;
      }>;
    }
  >();
  private readonly NEWS_CACHE_TTL_MS = 20 * 60_000;

  constructor() {
    logger.info('Initializing WebResearchTool (Playwright + Camoufox)');
  }

  private parseProxyDetails(proxyUrl?: string) {
    if (!proxyUrl) return { proxyConfig: null };
    return { proxyConfig: { server: proxyUrl } };
  }

  private async closeBrowser() {
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async setupContext(context: BrowserContext) {
    // Add any context setup here
  }

  private attachBrowserListeners() {
    if (!this.browser) return;
    this.browser.on('disconnected', () => {
      logger.warn('Browser disconnected');
      this.browser = null;
      this.browserContext = null;
    });
  }

  private attachContextListeners() {
    // Add any context listeners here
  }

  private async ensureBrowser(
    proxyUrl: string | undefined,
    userAgent: string
  ): Promise<void> {
    if (this.browserInitPromise) {
      await this.browserInitPromise;
      return;
    }

    if (
      this.browser &&
      this.browserContext &&
      this.browserProxyUrl === proxyUrl &&
      this.browserUserAgent === userAgent
    ) {
      return;
    }

    if (
      this.browser &&
      this.browserContext &&
      this.browserProxyUrl !== proxyUrl
    ) {
      logger.warn(
        `[WebResearchTool][Browser] Reinitializing browser due to proxy change`
      );
    }

    if (
      this.browser &&
      this.browserContext &&
      this.browserUserAgent !== userAgent
    ) {
      logger.warn(
        `[WebResearchTool][Browser] Reinitializing browser due to UA change`
      );
    }

    this.browserInitPromise = (async () => {
      if (this.browser) {
        await this.closeBrowser();
      }

      const proxyDetails = this.parseProxyDetails(proxyUrl);
      const camoufoxOpts = await camoufoxLaunchOptions({
        headless: this.browserHeadless,
        proxy: proxyDetails.proxyConfig ?? undefined,
        geoip: true
      });

      this.browser = await firefox.launch(camoufoxOpts);
      this.browserContext = await this.browser.newContext({
        userAgent,
        viewport: {
          width: DEFAULT_VIEWPORT.width,
          height: DEFAULT_VIEWPORT.height
        },
        deviceScaleFactor: DEFAULT_VIEWPORT.deviceScaleFactor
      });
      this.browserProxyUrl = proxyUrl;
      this.browserUserAgent = userAgent;
      await this.setupContext(this.browserContext);
      this.attachBrowserListeners();
      this.attachContextListeners();
    })();

    try {
      await this.browserInitPromise;
    } finally {
      this.browserInitPromise = null;
    }
  }

  public async fetchPage(
    url: string,
    extractSelector?: string
  ): Promise<{
    url: string;
    finalUrl?: string;
    status?: number;
    contentType?: string;
    html?: string;
    text: string;
  }> {
    logger.info({ url, extractSelector }, 'Fetching web page');

    try {
      const userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
      await this.ensureBrowser(undefined, userAgent);

      if (!this.browserContext) {
        throw new Error('Browser context not initialized');
      }

      const page = await this.browserContext.newPage();
      const resp = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      let content = '';
      if (extractSelector) {
        const element = await page.$(extractSelector);
        if (element) {
          content = await element.innerText();
        } else {
          content = `Selector '${extractSelector}' not found on page.`;
        }
      } else {
        // Extract main text content, stripping scripts and styles
        content = stripHtml(await page.content());
      }

      let html = '';
      try {
        html = await page.content();
      } catch {
        html = '';
      }

      const status =
        typeof resp?.status === 'function' ? resp.status() : undefined;
      const headers =
        typeof resp?.headers === 'function' ? resp.headers() : undefined;
      const contentType =
        headers && typeof headers['content-type'] === 'string'
          ? headers['content-type']
          : undefined;

      const finalUrl = typeof page.url === 'function' ? page.url() : undefined;

      await page.close();

      // Truncate to avoid blowing up LLM context
      const maxLen = 4000;
      return {
        url,
        finalUrl,
        status,
        contentType,
        text: content.substring(0, maxLen)
      };
    } catch (error: any) {
      logger.error({ url, err: error }, 'Failed to fetch page');
      return {
        url,
        text: `Error fetching page: ${error.message}`
      };
    }
  }

  public extractTextFromHtml(html: string, maxLen: number = 80000): string {
    return stripHtml(html).substring(0, maxLen);
  }

  public async getNews(
    query: string,
    maxSources: number = 3
  ): Promise<
    Array<{ title: string; url: string; snippet?: string; source?: string }>
  > {
    const q = typeof query === 'string' ? query.trim() : '';
    if (!q) throw new Error('query must be non-empty');
    const limit = Number.isFinite(maxSources)
      ? Math.max(1, Math.min(10, Math.floor(maxSources)))
      : 3;
    const cacheKey = `${q}::${limit}`;
    const cached = this.newsCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.value;
    }

    logger.debug('here');

    const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&ia=news`;
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
    await this.ensureBrowser(undefined, userAgent);
    if (!this.browserContext)
      throw new Error('Browser context not initialized');

    const page = await this.browserContext.newPage();
    try {
      logger.debug('here2');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Best-effort scraping: DDG often renders results client-side; use DOM once loaded.
      logger.debug('here3');
      const items = await page.evaluate(() => {
        const out: any[] = [];
        const cards = document.querySelectorAll(
          'a[href][data-testid="result-title-a"], a.result__a, a[href].js-result-title-link'
        );
        for (const a of Array.from(cards)) {
          const el = a as HTMLAnchorElement;
          const title = (el.innerText || '').trim();
          const href = (el.href || '').trim();
          if (!title || !href) continue;
          out.push({ title, url: href });
          if (out.length >= 20) break;
        }
        return out;
      });
      logger.debug(JSON.stringify(items));

      const unique: Array<{ title: string; url: string }> = [];
      const seen = new Set<string>();
      for (const it of Array.isArray(items) ? items : []) {
        const u = typeof it?.url === 'string' ? it.url : '';
        const t = typeof it?.title === 'string' ? it.title : '';
        if (!u || !t) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        unique.push({ title: t, url: u });
        if (unique.length >= limit) break;
      }
      this.newsCache.set(cacheKey, {
        expiresAtMs: Date.now() + this.NEWS_CACHE_TTL_MS,
        value: unique
      });
      return unique;
    } finally {
      await page.close();
    }
  }

  public invalidateNewsCache(): void {
    this.newsCache.clear();
  }
}
