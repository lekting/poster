import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import { config } from '../config/index.js';
import { logger } from '../shared/logger.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
const VIEWPORT = { width: 1280, height: 720 };

export class XBrowserTool {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async launch(proxyUrl?: string): Promise<void> {
    const proxyConfig = proxyUrl ? { server: proxyUrl } : undefined;
    const opts = await camoufoxLaunchOptions({
      headless: config.CAMOUFOX_HEADLESS,
      proxy: proxyConfig ?? undefined,
      geoip: true
    });
    logger.info({ headless: config.CAMOUFOX_HEADLESS, proxy: proxyUrl ?? null }, 'XBrowserTool launching Camoufox Firefox');
    this.browser = await firefox.launch(opts);
    this.context = await this.browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT
    });
    logger.info('XBrowserTool launched — context ready');
  }

  async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser not launched');
    return this.context.newPage();
  }

  async addCookies(cookies: Parameters<BrowserContext['addCookies']>[0]): Promise<void> {
    if (!this.context) throw new Error('Browser not launched');
    await this.context.addCookies(cookies);
  }

  async getCookies(urls?: string | string[]): Promise<ReturnType<BrowserContext['cookies']> extends Promise<infer R> ? R : never> {
    if (!this.context) throw new Error('Browser not launched');
    return urls ? this.context.cookies(urls) : this.context.cookies();
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('XBrowserTool closed');
  }
}
