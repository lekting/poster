/**
 * XCamoufoxTool — Camoufox-based X/Twitter automation.
 * All account registration and posting goes through browser automation.
 */
import { Page } from 'playwright';
import path from 'path';
import { XBrowserTool } from './x-browser.js';
import { logger } from '../shared/logger.js';

export interface RegisterAccountInput {
  email: string;
  password: string;
  username: string;
  proxyUrl?: string;
  /** Called when X requires email verification. Should return the code or null on timeout. */
  getVerificationCode?: () => Promise<string | null>;
}

export interface RegisterAccountResult {
  success: boolean;
  handle?: string;
  authToken?: string;
  error?: string;
}

export interface PostTweetInput {
  authToken: string;
  text: string;
  mediaPaths?: string[];
}

export interface PostTweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
  isPremium?: boolean;
}

const SIGNUP_URL = 'https://x.com/i/flow/signup';
const DEFAULT_TIMEOUT = 30000;
const SCREENSHOTS_DIR = 'screenshots';
const MEDIA_INPUT_SELECTORS = [
  'input[data-testid="fileInput"]',
  'input[type="file"][accept*="image"]',
  'input[type="file"][accept*="video"]',
  'input[type="file"]'
];

async function capturePageDiagnostics(
  page: Page,
  label: string
): Promise<string | null> {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${SCREENSHOTS_DIR}/${label}-${ts}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    logger.info({ filename }, `${label}: screenshot saved`);

    const diagnostics = await page.evaluate(() => {
      const results: Record<string, string | null> = {};
      const toast = document.querySelector('[data-testid="toast"]');
      results.toast = toast?.textContent?.trim() ?? null;
      const inlineError = document.querySelector(
        '[data-testid="inline_error"]'
      );
      results.inlineError = inlineError?.textContent?.trim() ?? null;
      const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
      results.alerts =
        alerts
          .map((a) => a.textContent?.trim())
          .filter(Boolean)
          .join(' | ') || null;
      results.url = location.href;
      results.title = document.title;
      return results;
    });
    logger.info({ label, ...diagnostics }, `${label}: page diagnostics`);
    return (
      diagnostics.toast || diagnostics.inlineError || diagnostics.alerts || null
    );
  } catch (err) {
    logger.warn({ err, label }, 'Failed to capture page diagnostics');
    return null;
  }
}

/** Race all selectors in parallel — returns as soon as the first one is found. */
async function waitAndFill(
  page: Page,
  selectors: string[],
  value: string,
  label: string,
  timeout = 5000
): Promise<boolean> {
  try {
    const el = page.locator(selectors.join(', ')).first();
    await el.waitFor({ state: 'visible', timeout });
    await el.fill(value);
    logger.debug({ label }, 'Filled field');
    return true;
  } catch {
    return false;
  }
}

/** Race all selectors in parallel — clicks the first one found. */
async function waitAndClick(
  page: Page,
  selectors: string[],
  label: string,
  timeout = 5000
): Promise<boolean> {
  try {
    const el = page.locator(selectors.join(', ')).first();
    await el.waitFor({ state: 'visible', timeout });
    await el.click();
    logger.debug({ label }, 'Clicked');
    return true;
  } catch {
    return false;
  }
}

async function uploadMediaFiles(
  page: Page,
  mediaPaths: string[]
): Promise<{ success: boolean; error?: string }> {
  if (mediaPaths.length === 0) return { success: true };

  const validPaths = mediaPaths
    .map((filePath) => path.resolve(filePath))
    .filter(Boolean);

  logger.info(
    { count: validPaths.length, mediaPaths: validPaths },
    'postTweet: uploading media'
  );

  let uploaded = false;
  for (const selector of MEDIA_INPUT_SELECTORS) {
    try {
      const input = page.locator(selector).first();
      await input.waitFor({ state: 'attached', timeout: 5000 });
      await input.setInputFiles(validPaths, { timeout: 15000 });
      uploaded = true;
      logger.info({ selector }, 'postTweet: media files selected');
      break;
    } catch (err) {
      logger.debug({ err, selector }, 'postTweet: media input selector failed');
    }
  }

  if (!uploaded) {
    return { success: false, error: 'Could not find media upload input' };
  }

  const uploadState = await page
    .waitForFunction(
      () => {
        const errorNode =
          document.querySelector('[data-testid="toast"]') ??
          document.querySelector('[data-testid="inline_error"]');
        const errorText = errorNode?.textContent?.toLowerCase() ?? '';
        if (
          errorText.includes('failed') ||
          errorText.includes('invalid') ||
          errorText.includes('unsupported') ||
          errorText.includes('too large')
        ) {
          return 'error';
        }

        const processing = Array.from(
          document.querySelectorAll('[role="progressbar"], [aria-valuetext]')
        ).some((node) => {
          const lbl =
            node.getAttribute('aria-label')?.toLowerCase() ??
            node.getAttribute('aria-valuetext')?.toLowerCase() ??
            '';
          return (
            lbl.includes('upload') ||
            lbl.includes('processing') ||
            lbl.includes('loading')
          );
        });

        if (processing) return false;

        const mediaPreview = document.querySelector(
          '[data-testid="attachments"], [data-testid="tweetPhoto"], [data-testid="previewInterstitial"], [aria-label*="media" i], [aria-label*="image" i], [aria-label*="video" i]'
        );

        return mediaPreview ? 'ready' : false;
      },
      { timeout: 60000 }
    )
    .then((handle) => handle.jsonValue() as Promise<'ready' | 'error'>)
    .catch(() => 'timeout' as const);

  if (uploadState === 'error' || uploadState === 'timeout') {
    if (uploadState === 'timeout') {
      logger.warn('postTweet: media preview wait timed out');
    }
    const uploadError = await capturePageDiagnostics(page, 'postTweet-media');
    if (uploadError) {
      const lower = uploadError.toLowerCase();
      if (
        lower.includes('failed') ||
        lower.includes('invalid') ||
        lower.includes('unsupported') ||
        lower.includes('too large')
      ) {
        return { success: false, error: uploadError };
      }
    }
  }

  return { success: true };
}

/** Insert text into a contenteditable using execCommand, with keyboard.type fallback. */
async function insertText(
  page: Page,
  el: ReturnType<Page['locator']>,
  text: string
): Promise<void> {
  await el.click();
  await page.waitForTimeout(200);

  const lines = text.split('\n');
  let insertOk = true;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.press('Enter');
    }
    if (lines[i].length > 0) {
      const ok = await el.evaluate((node, line) => {
        node.focus();
        return document.execCommand('insertText', false, line);
      }, lines[i]);
      if (!ok) {
        insertOk = false;
        break;
      }
    }
  }

  if (!insertOk) {
    logger.warn('insertText: execCommand failed, falling back to keyboard.type');
    await el.evaluate((node) => {
      node.textContent = '';
    }, null);
    await page.keyboard.type(text, { delay: 5 });
  }
}

export class XCamoufoxTool {
  async registerAccount(
    input: RegisterAccountInput
  ): Promise<RegisterAccountResult> {
    const browser = new XBrowserTool();
    try {
      await browser.launch(input.proxyUrl);
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      await page.goto(SIGNUP_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await page.waitForSelector('[data-testid="apple_sign_in_button"]');
      await page
        .locator('[data-testid="apple_sign_in_button"] + * + *')
        .click();

      if (!(await waitAndFill(page, ['input[autocomplete="name"]'], input.username, 'name'))) {
        return { success: false, error: 'Could not find name input' };
      }

      if (!(await waitAndFill(page, ['input[autocomplete="email"]'], input.email, 'email'))) {
        return { success: false, error: 'Could not find email input' };
      }

      const dobInputs = await page.locator('select').all();
      if (dobInputs.length >= 3) {
        await dobInputs[0].fill('1');
        await dobInputs[1].fill('1');
        await dobInputs[2].fill('1990');
      }

      const nextSelectors = [
        'button[data-testid="ocfSignupNextButton"]',
        'button:has-text("Next")',
        'span:has-text("Next")',
        '[role="button"]:has-text("Next")'
      ];
      await waitAndClick(page, nextSelectors, 'next after dob').catch(() => {});
      await page.waitForTimeout(1000);

      const usernameSelectors = [
        'input[data-testid="ocfSignupTextInput"]',
        'input[name="username"]',
        'input[placeholder*="username" i]'
      ];
      if (!(await waitAndFill(page, usernameSelectors, input.username, 'username'))) {
        return { success: false, error: 'Could not find username input' };
      }
      await waitAndClick(page, nextSelectors, 'next after username').catch(() => {});
      await page.waitForTimeout(1000);

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[data-testid="ocfSignupTextInput"]'
      ];
      if (!(await waitAndFill(page, passwordSelectors, input.password, 'password'))) {
        return { success: false, error: 'Could not find password input' };
      }

      const signupSelectors = [
        'button[data-testid="ocfSignupSubmitButton"]',
        'button:has-text("Sign up")',
        'span:has-text("Sign up")'
      ];
      if (!(await waitAndClick(page, signupSelectors, 'sign up'))) {
        return { success: false, error: 'Could not find Sign up button' };
      }

      // Wait for signup to process — check for verification input or redirect
      await page.waitForFunction(
        () => {
          const verInput = document.querySelector(
            'input[data-testid="ocfSignupTextInput"], input[inputmode="numeric"]'
          );
          if (verInput) return true;
          const url = location.href;
          return url.includes('home') || url.includes('explore');
        },
        { timeout: 10000 }
      ).catch(() => {});

      const verificationInput = page
        .locator('input[data-testid="ocfSignupTextInput"], input[type="text"], input[inputmode="numeric"]')
        .first();
      const isVerificationVisible = await verificationInput
        .isVisible()
        .catch(() => false);

      if (isVerificationVisible) {
        logger.info('X signup requires email verification, requesting code...');
        const code = input.getVerificationCode
          ? await input.getVerificationCode()
          : null;
        if (!code) {
          return {
            success: false,
            error: 'Verification code required but could not be obtained'
          };
        }
        await verificationInput.fill(code);
        await waitAndClick(page, nextSelectors, 'submit verification').catch(() => {});

        // Wait for post-verification navigation
        await page.waitForFunction(
          () => {
            const url = location.href;
            return url.includes('home') || url.includes('explore');
          },
          { timeout: 10000 }
        ).catch(() => {});
      }

      const currentUrl = page.url();
      if (
        currentUrl.includes('home') ||
        currentUrl.includes('explore') ||
        currentUrl.includes('flow')
      ) {
        const handleFromUrl = currentUrl.match(/x\.com\/([^/?]+)/)?.[1];
        const cookies = await browser.getCookies('https://x.com');
        const authCookie = cookies.find((c) => c.name === 'auth_token');
        return {
          success: true,
          handle: handleFromUrl ?? input.username,
          authToken: authCookie?.value
        };
      }

      const errorEl = page.locator('[data-testid="error"]').first();
      const errorText = await errorEl.textContent().catch(() => null);
      return {
        success: false,
        error:
          errorText?.trim() ||
          'Registration did not complete. Check for captcha or blocks.'
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, email: input.email }, 'X registration failed');
      return { success: false, error: msg };
    } finally {
      await browser.close();
    }
  }

  async postTweet(input: PostTweetInput): Promise<PostTweetResult> {
    const browser = new XBrowserTool();
    try {
      logger.info('postTweet: launching browser');
      await browser.launch();

      logger.info('postTweet: setting auth_token cookie');
      await browser.addCookies([
        {
          name: 'auth_token',
          value: input.authToken,
          domain: '.x.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None'
        }
      ]);

      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      // Navigate to home to establish full session (ct0 CSRF cookie, etc.)
      logger.info('postTweet: navigating to x.com/home to init session');
      await page.goto('https://x.com/home', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});

      const homeUrl = page.url();
      logger.info({ url: homeUrl }, 'postTweet: home loaded');
      if (homeUrl.includes('login') || homeUrl.includes('flow/login')) {
        logger.warn(
          'postTweet: redirected to login — auth_token invalid or expired'
        );
        return { success: false, error: 'auth_token is invalid or expired' };
      }

      // Detect premium status (non-blocking, quick check)
      const isPremium = await page.evaluate(() => {
        const switcher = document.querySelector(
          '[data-testid="SideNav_AccountSwitcher_Button"]'
        );
        if (switcher?.querySelector('svg[data-testid="icon-verified"]')) return true;
        if (document.querySelector('a[href="/i/premium_sign_up"]')) return false;
        return !!document.querySelector('nav svg[data-testid="icon-verified"]');
      }).catch(() => false);
      logger.info({ isPremium }, 'postTweet: premium status detected');

      // Open compose
      logger.info('postTweet: navigating to compose');
      await page.goto('https://x.com/compose/post', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // Wait for compose area to appear (event-driven, not hard timeout)
      const composeSelector = '[data-testid="tweetTextarea_0"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]';
      const composeEl = page.locator(composeSelector).first();
      try {
        await composeEl.waitFor({ state: 'visible', timeout: 8000 });
      } catch {
        logger.warn('postTweet: could not find compose area');
        return { success: false, error: 'Could not find compose area' };
      }

      logger.info('postTweet: filling compose area');
      await insertText(page, composeEl, input.text);
      logger.info('postTweet: text entered');

      // Upload media if provided
      if (input.mediaPaths && input.mediaPaths.length > 0) {
        const uploadResult = await uploadMediaFiles(page, input.mediaPaths);
        if (!uploadResult.success) {
          logger.warn(
            { error: uploadResult.error },
            'postTweet: media upload failed'
          );
          return {
            success: false,
            error: uploadResult.error,
            isPremium
          };
        }
      }

      // Brief settle before posting
      await page.waitForTimeout(500);

      const postButtonSelector = '[data-testid="tweetButton"], button[data-testid="tweetButton"]';
      const MAX_POST_ATTEMPTS = 3;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_POST_ATTEMPTS; attempt++) {
        logger.info({ attempt }, 'postTweet: clicking Post button');
        const btn = page.locator(postButtonSelector).first();
        const btnVisible = await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);

        if (btnVisible) {
          await btn.click();
          logger.info({ attempt }, 'postTweet: Post button clicked');
        } else {
          logger.warn('postTweet: Post button not found, falling back to Ctrl+Enter');
          await page.keyboard.press('Control+Enter');
        }

        // Wait for success OR error signals
        logger.info({ attempt }, 'postTweet: waiting for confirmation or error');
        const outcome = await page
          .waitForFunction(
            () => {
              const currentUrl = location.href;
              const compose = document.querySelector(
                '[data-testid="tweetTextarea_0"]'
              );
              const hasStatus = currentUrl.includes('/status/');
              const leftCompose =
                !currentUrl.includes('/compose/post') &&
                !currentUrl.includes('/login') &&
                !currentUrl.includes('/flow/login');

              if (leftCompose || !compose || hasStatus)
                return { done: true, success: true, error: null };

              const toast = document.querySelector('[data-testid="toast"]');
              if (toast) {
                const toastText = toast.textContent?.trim() ?? '';
                if (!toastText)
                  return { done: true, success: true, error: null };
                const lower = toastText.toLowerCase();
                if (lower.includes('sent') || lower.includes('posted')) {
                  return { done: true, success: true, error: null };
                }
                return { done: true, success: false, error: toastText };
              }

              const inlineError = document.querySelector(
                '[data-testid="inline_error"]'
              );
              if (inlineError?.textContent?.trim()) {
                return {
                  done: true,
                  success: false,
                  error: inlineError.textContent.trim()
                };
              }

              const alerts = document.querySelectorAll('[role="alert"]');
              for (const alert of alerts) {
                if (alert.closest('[data-testid="tweetTextarea_0"]')) continue;
                if (alert.closest('[contenteditable]')) continue;
                const t = alert.textContent?.trim();
                if (t && t.length > 10)
                  return { done: true, success: false, error: t };
              }

              return false;
            },
            { timeout: 15000 }
          )
          .then(
            (handle) =>
              handle.jsonValue() as Promise<{
                done: boolean;
                success: boolean;
                error: string | null;
              }>
          )
          .catch(() => ({
            done: false,
            success: false,
            error: null as string | null
          }));

        const tweetUrl = page.url();
        const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);

        logger.info(
          { tweetUrl, outcome, attempt, tweetId: tweetIdMatch?.[1] ?? null },
          'postTweet: attempt result'
        );

        if (outcome.success || tweetIdMatch) {
          return {
            success: true,
            tweetId: tweetIdMatch?.[1] ?? undefined,
            isPremium
          };
        }

        lastError = outcome.error;

        // Error from X — dismiss toast and retry
        if (outcome.error && attempt < MAX_POST_ATTEMPTS) {
          logger.warn(
            { error: outcome.error, attempt },
            'postTweet: X error, will retry'
          );

          try {
            const toast = page.locator('[data-testid="toast"]').first();
            if (await toast.isVisible().catch(() => false)) {
              await toast.click().catch(() => {});
            }
          } catch {
            /* ignore */
          }

          // Wait for toast to disappear
          await page
            .waitForFunction(
              () => !document.querySelector('[data-testid="toast"]'),
              { timeout: 3000 }
            )
            .catch(() => {});

          await page.waitForTimeout(1000);
          continue;
        }
      }

      // All attempts failed
      await capturePageDiagnostics(page, 'postTweet-failed');
      return {
        success: false,
        error: lastError || 'Post failed after all retry attempts',
        isPremium
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (browser) {
        try {
          const pages = browser['context']?.pages?.() ?? [];
          const activePage = pages[0];
          if (activePage)
            await capturePageDiagnostics(activePage, 'postTweet-crash');
        } catch {
          /* ignore */
        }
      }
      logger.error({ err }, 'postTweet: crashed');
      return { success: false, error: msg };
    } finally {
      logger.info('postTweet: closing browser');
      await browser.close();
    }
  }
}
