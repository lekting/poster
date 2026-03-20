/**
 * ThreadsCamoufoxTool — Camoufox-based Threads (Meta) automation.
 * Handles login with 2FA, cookie persistence, multi-part thread posting,
 * and reply comments.
 */
import { Page, Cookie } from 'playwright';
import { generateTOTP } from '../shared/totp.js';
import { XBrowserTool } from './x-browser.js';
import { logger } from '../shared/logger.js';

const THREADS_BASE = 'https://www.threads.com/?hl=en';
const LOGIN_URL =
  'https://www.threads.com/login/?show_toa_choice_screen=false&variant=toa&hl=en';
const DEFAULT_TIMEOUT = 30_000;

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface ThreadsLoginInput {
  username: string;
  password: string;
  /** Base32 TOTP secret for 2FA */
  totpSecret: string;
  /** Previously saved cookies to try first */
  cookies?: Cookie[];
}

export interface ThreadsLoginResult {
  success: boolean;
  cookies?: Cookie[];
  error?: string;
}

export interface ThreadsPostInput {
  /** Parts of the thread. First element = main post, rest = "Add to thread" posts */
  parts: string[];
  /** Optional: media file paths per part (index matches parts) */
  mediaParts?: (string[] | undefined)[];
  /** Auth context */
  username: string;
  password: string;
  totpSecret: string;
  cookies?: Cookie[];
}

export interface ThreadsPostResult {
  success: boolean;
  postUrl?: string;
  /** Updated cookies to persist */
  cookies?: Cookie[];
  error?: string;
}

export interface ThreadsReplyInput {
  /** URL of the post to reply to */
  postUrl: string;
  /** Reply text */
  text: string;
  /** Auth context */
  username: string;
  password: string;
  totpSecret: string;
  cookies?: Cookie[];
}

export interface ThreadsReplyResult {
  success: boolean;
  cookies?: Cookie[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function captureThreadsDiagnostics(
  page: Page,
  label: string
): Promise<string | null> {
  try {
    const diagnostics = await page.evaluate(() => {
      const results: Record<string, string | null> = {};
      const errorEl = document.querySelector('[role="alert"]');
      results.alert = errorEl?.textContent?.trim() ?? null;
      results.url = location.href;
      results.title = document.title;
      return results;
    });
    logger.info({ label, ...diagnostics }, `${label}: page diagnostics`);
    return diagnostics.alert || null;
  } catch (err) {
    logger.warn({ err, label }, 'Failed to capture Threads diagnostics');
    return null;
  }
}

async function waitAndFill(
  page: Page,
  selectors: string[],
  value: string,
  label: string
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 8000 });
      await el.fill(value);
      logger.debug({ label, selector: sel }, 'Filled field');
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

interface Selector {
  selector: string;
  hasText?: string;
}

async function waitAndClick(
  page: Page,
  selectors: Selector[],
  label: string,
  timeout = 8000
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page
        .locator(
          sel.selector,
          sel.hasText ? { hasText: sel.hasText } : undefined
        )
        .first();
      logger.debug({ label, selector: sel }, 'Searching for element to click');
      await el.waitFor({ timeout });
      await el.click();
      logger.debug({ label, selector: sel }, 'Clicked');
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** Type text into a contenteditable div line-by-line. */
async function typeIntoContentEditable(
  page: Page,
  locator: ReturnType<Page['locator']>,
  text: string
): Promise<boolean> {
  await locator.click();
  await page.waitForTimeout(300);

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.press('Enter');
    }
    if (lines[i].length > 0) {
      const ok = await locator.evaluate((node, line) => {
        (node as HTMLElement).focus();
        return document.execCommand('insertText', false, line);
      }, lines[i]);
      if (!ok) {
        // Fallback to keyboard.type
        await page.keyboard.type(lines[i], { delay: 10 });
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Main Tool                                                         */
/* ------------------------------------------------------------------ */

export class ThreadsCamoufoxTool {
  /**
   * Attempt login using saved cookies, falling back to username/password + 2FA.
   * Returns updated cookies on success.
   */
  async login(input: ThreadsLoginInput): Promise<ThreadsLoginResult> {
    const browser = new XBrowserTool();
    try {
      await browser.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      // Try cookies first
      if (input.cookies && input.cookies.length > 0) {
        logger.info('threads login: trying saved cookies');
        await browser.addCookies(input.cookies);
        await page.goto(THREADS_BASE, {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });
        await page
          .waitForLoadState('networkidle', { timeout: 10000 })
          .catch(() => {});

        const isLoggedIn = await this.checkLoggedIn(page);
        if (isLoggedIn) {
          logger.info('threads login: cookies still valid');
          const freshCookies = await browser.getCookies(THREADS_BASE);
          return { success: true, cookies: freshCookies };
        }
        logger.info(
          'threads login: cookies expired, proceeding with credentials'
        );
      }

      // Navigate to login page
      await page.goto(LOGIN_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(2000);

      // Fill username
      const usernameSelectors = [
        'input[autocomplete="username"]',
        'input[type="text"]'
      ];
      if (
        !(await waitAndFill(
          page,
          usernameSelectors,
          input.username,
          'username'
        ))
      ) {
        return {
          success: false,
          error: 'Could not find username input on Threads login'
        };
      }

      // Fill password
      const passwordSelectors = [
        'input[autocomplete="current-password"]',
        'input[type="password"]'
      ];
      if (
        !(await waitAndFill(
          page,
          passwordSelectors,
          input.password,
          'password'
        ))
      ) {
        return {
          success: false,
          error: 'Could not find password input on Threads login'
        };
      }

      // Click login button
      const loginButtonSelectors: Selector[] = [
        { selector: 'button[type="submit"]' },
        { selector: 'div[role="button"]', hasText: 'Log in' },
        { selector: 'button', hasText: 'Log in' },
        { selector: 'span', hasText: 'Log in' }
      ];
      if (!(await waitAndClick(page, loginButtonSelectors, 'login button'))) {
        return { success: false, error: 'Could not find login button' };
      }

      // Poll for either 2FA prompt or successful login (up to 15 seconds)
      let needs2fa = false;
      let alreadyLoggedIn = false;
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        needs2fa = await this.check2faPrompt(page);
        if (needs2fa) break;
        alreadyLoggedIn = await this.checkLoggedIn(page);
        if (alreadyLoggedIn) break;
        logger.debug(
          { attempt: i + 1 },
          'threads login: waiting for 2FA or redirect'
        );
      }

      if (needs2fa) {
        logger.info('threads login: 2FA required, generating TOTP code');
        const totpRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
        const code = generateTOTP(input.totpSecret);
        logger.info(
          { codeLength: code.length, totpWindowRemaining: totpRemaining },
          'threads login: TOTP code generated'
        );

        const codeSelectors = [
          'input[autocomplete="one-time-code"]',
          'input[inputmode="numeric"]'
        ];
        if (!(await waitAndFill(page, codeSelectors, code, '2fa code'))) {
          return { success: false, error: 'Could not find 2FA code input' };
        }

        const confirm2faSelectors: Selector[] = [
          { selector: 'div[role="button"]', hasText: 'Submit' },
          { selector: 'button', hasText: 'Submit' }
        ];
        await waitAndClick(page, confirm2faSelectors, '2fa confirm');

        // Wait for Threads to process 2FA and redirect away from login
        logger.info('threads login: waiting for post-2FA redirect');
        try {
          await page.waitForURL((url) => !url.toString().includes('/login'), {
            timeout: 15000
          });
        } catch {
          logger.warn('threads login: no redirect after 2FA submit');
        }
        await page
          .waitForLoadState('networkidle', { timeout: 10000 })
          .catch(() => {});
        await page.waitForTimeout(2000);
      }

      // Navigate to English page before checking login state
      await page.goto(THREADS_BASE, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});

      // Verify we're logged in
      const loggedIn = await this.checkLoggedIn(page);
      if (!loggedIn) {
        const diagnostic = await captureThreadsDiagnostics(
          page,
          'threads-login-failed'
        );
        return {
          success: false,
          error:
            diagnostic ||
            'Login did not complete. Check credentials or 2FA key.'
        };
      }

      const cookies = await browser.getCookies(THREADS_BASE);
      logger.info('threads login: success');
      return { success: true, cookies };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'threads login: crashed');
      return { success: false, error: msg };
    } finally {
      await browser.close();
    }
  }

  /**
   * Post a multi-part thread. First part = main post, subsequent parts = "Add to thread".
   * Links should go in comment parts (thread replies), NOT in the first post.
   */
  async postThread(input: ThreadsPostInput): Promise<ThreadsPostResult> {
    if (input.parts.length === 0) {
      return { success: false, error: 'No parts to post' };
    }

    // Validate each part is within 500 chars
    for (let i = 0; i < input.parts.length; i++) {
      if (input.parts[i].length > 500) {
        return {
          success: false,
          error: `Part ${i + 1} exceeds 500 character limit (${input.parts[i].length})`
        };
      }
    }

    const browser = new XBrowserTool();
    try {
      await browser.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      // Authenticate
      const authResult = await this.authenticateInBrowser(browser, page, input);
      if (!authResult.success) {
        return { success: false, error: authResult.error };
      }

      // Navigate to home / create new post
      logger.info('threads post: navigating to home');
      await page.goto(THREADS_BASE, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(2000);

      // Click "New thread" / compose button
      const composeSelectors: Selector[] = [
        { selector: '[aria-label="Create"]' },
        { selector: '[aria-label="New thread"]' },
        { selector: 'a[href="/create"]' },
        { selector: 'svg[aria-label="Create"]' },
        { selector: '[data-pressable-container="true"]', hasText: 'Create' }
      ];

      let composeOpened = await waitAndClick(
        page,
        composeSelectors,
        'compose button',
        5000
      );
      if (!composeOpened) {
        // Try navigating directly
        logger.info('threads post: trying direct navigation to compose');
        await page.goto(`${THREADS_BASE}/create`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        await page.waitForTimeout(2000);
        composeOpened = true;
      }

      // Wait for composer to appear
      await page.waitForTimeout(1500);

      // Fill first part
      logger.info('threads post: filling first part');
      const firstPartOk = await this.fillComposeArea(page, input.parts[0], 0);
      if (!firstPartOk) {
        await captureThreadsDiagnostics(page, 'threads-compose-failed');
        return { success: false, error: 'Could not find compose text area' };
      }

      // Upload media for first part if provided
      if (input.mediaParts?.[0] && input.mediaParts[0].length > 0) {
        await this.uploadMediaForPart(page, input.mediaParts[0]);
      }

      // Add additional parts via "Add to thread"
      for (let i = 1; i < input.parts.length; i++) {
        logger.info({ partIndex: i }, 'threads post: adding thread part');
        await page.waitForTimeout(1000);

        // Click "Add to thread" button
        const addToThreadSelectors: Selector[] = [
          { selector: 'div[role="button"]', hasText: 'Add to thread' },
          { selector: 'button', hasText: 'Add to thread' },
          { selector: 'span', hasText: 'Add to thread' },
          { selector: '[aria-label="Add to thread"]' }
        ];
        const addClicked = await waitAndClick(
          page,
          addToThreadSelectors,
          'add to thread'
        );
        if (!addClicked) {
          logger.warn(
            { partIndex: i },
            'threads post: could not find "Add to thread" button'
          );
          break;
        }

        await page.waitForTimeout(1000);

        // Fill the new compose area (it should be the last one)
        const partOk = await this.fillComposeArea(page, input.parts[i], i);
        if (!partOk) {
          logger.warn(
            { partIndex: i },
            'threads post: could not fill thread part'
          );
          break;
        }

        // Upload media for this part if provided
        if (input.mediaParts?.[i] && input.mediaParts[i]!.length > 0) {
          await this.uploadMediaForPart(page, input.mediaParts[i]!);
        }
      }

      await page.waitForTimeout(1000);

      // Click "Post" / publish button
      logger.info('threads post: publishing');
      const postButtonSelectors: Selector[] = [
        { selector: 'div[role="dialog"] div[role="button"]', hasText: 'Post' },
        { selector: 'button', hasText: 'Post' },
        { selector: '[aria-label="Post"]' }
      ];

      let posted = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const clicked = await waitAndClick(
          page,
          postButtonSelectors,
          'post button'
        );
        if (!clicked) {
          logger.warn({ attempt }, 'threads post: Post button not found');
          break;
        }

        // Wait for navigation or confirmation
        await page.waitForTimeout(5000);

        const currentUrl = page.url();
        // After posting, Threads typically redirects away from /create
        if (
          !currentUrl.includes('/create') ||
          currentUrl.includes('/post/') ||
          currentUrl.includes('/t/')
        ) {
          posted = true;
          break;
        }

        // Check if compose area disappeared
        const composeGone = await page.evaluate(() => {
          const editors = document.querySelectorAll('[contenteditable="true"]');
          return editors.length === 0;
        });
        if (composeGone) {
          posted = true;
          break;
        }

        logger.warn(
          { attempt, url: currentUrl },
          'threads post: post may not have submitted, retrying'
        );
        await page.waitForTimeout(2000);
      }

      const finalUrl = page.url();
      const cookies = await browser.getCookies(THREADS_BASE);
      logger.info(
        {
          cookieCount: cookies.length,
          domains: [...new Set(cookies.map((c) => c.domain))]
        },
        'threads post: cookies collected'
      );

      if (posted) {
        logger.info({ url: finalUrl }, 'threads post: published successfully');
        return { success: true, postUrl: finalUrl, cookies };
      }

      await captureThreadsDiagnostics(page, 'threads-post-failed');
      return {
        success: false,
        error: 'Post did not publish after retries',
        cookies
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'threads post: crashed');
      return { success: false, error: msg };
    } finally {
      await browser.close();
    }
  }

  /**
   * Reply to an existing post with a comment.
   * Used for adding links to own posts (since links can't go in main Threads post).
   */
  async replyToPost(input: ThreadsReplyInput): Promise<ThreadsReplyResult> {
    if (input.text.length > 500) {
      return {
        success: false,
        error: `Reply exceeds 500 character limit (${input.text.length})`
      };
    }

    const browser = new XBrowserTool();
    try {
      await browser.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      // Authenticate
      const authResult = await this.authenticateInBrowser(browser, page, input);
      if (!authResult.success) {
        return { success: false, error: authResult.error };
      }

      // Navigate to the post
      logger.info(
        { postUrl: input.postUrl },
        'threads reply: navigating to post'
      );
      await page.goto(input.postUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(2000);

      // Click the reply area / "Reply" button
      const replyTriggerSelectors = [
        { selector: '[aria-label="Reply"]' },
        { selector: 'div[role="button"]', hasText: 'Reply' },
        { selector: 'svg', hasText: 'Reply' },
        { selector: '[data-pressable-container="true"]', hasText: 'Reply' }
      ];
      await waitAndClick(page, replyTriggerSelectors, 'reply trigger', 5000);
      await page.waitForTimeout(1500);

      // Find the reply text area and type
      const replyAreaSelectors = [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'p[contenteditable="true"]'
      ];
      let replied = false;
      for (const sel of replyAreaSelectors) {
        try {
          // Get the LAST contenteditable (the reply one, not the original post)
          const el = page.locator(sel).last();
          await el.waitFor({ state: 'visible', timeout: 5000 });
          await typeIntoContentEditable(page, el, input.text);
          replied = true;
          break;
        } catch {
          continue;
        }
      }

      if (!replied) {
        await captureThreadsDiagnostics(page, 'threads-reply-no-textarea');
        return { success: false, error: 'Could not find reply text area' };
      }

      await page.waitForTimeout(1000);

      // Click Post reply button
      const postReplySelectors: Selector[] = [
        { selector: 'div[role="button"]', hasText: 'Post' },
        { selector: 'button', hasText: 'Post' },
        { selector: 'div[role="button"]', hasText: 'Reply' }
      ];
      const postClicked = await waitAndClick(
        page,
        postReplySelectors,
        'post reply'
      );
      if (!postClicked) {
        return { success: false, error: 'Could not find reply Post button' };
      }

      await page.waitForTimeout(5000);

      const cookies = await browser.getCookies(THREADS_BASE);
      logger.info('threads reply: posted successfully');
      return { success: true, cookies };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'threads reply: crashed');
      return { success: false, error: msg };
    } finally {
      await browser.close();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Private helpers                                                  */
  /* ---------------------------------------------------------------- */

  private async authenticateInBrowser(
    browser: XBrowserTool,
    page: Page,
    creds: {
      username: string;
      password: string;
      totpSecret: string;
      cookies?: Cookie[];
    }
  ): Promise<{ success: boolean; error?: string }> {
    // Try cookies first
    if (creds.cookies && creds.cookies.length > 0) {
      logger.info('threads auth: trying saved cookies');
      await browser.addCookies(creds.cookies);
      await page.goto(THREADS_BASE, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});

      if (await this.checkLoggedIn(page)) {
        logger.info('threads auth: cookies valid');
        return { success: true };
      }
      logger.info('threads auth: cookies expired, doing full login');
    }

    // Full login
    await page.goto(LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(2000);

    // Username
    const usernameSelectors = [
      'input[autocomplete="username"]',
      'input[type="text"]'
    ];
    if (
      !(await waitAndFill(page, usernameSelectors, creds.username, 'username'))
    ) {
      return { success: false, error: 'Could not find username input' };
    }

    // Password
    const passwordSelectors = [
      'input[autocomplete="current-password"]',
      'input[type="password"]'
    ];
    if (
      !(await waitAndFill(page, passwordSelectors, creds.password, 'password'))
    ) {
      return { success: false, error: 'Could not find password input' };
    }

    // Login
    const loginBtnSelectors: Selector[] = [
      { selector: 'button[type="submit"]' },
      { selector: 'div[role="button"]', hasText: 'Log in' },
      { selector: 'button', hasText: 'Log in' }
    ];
    if (!(await waitAndClick(page, loginBtnSelectors, 'login button'))) {
      return { success: false, error: 'Could not find login button' };
    }

    // Poll for either 2FA prompt or successful login (up to 15 seconds)
    let needs2fa = false;
    let alreadyLoggedIn = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      needs2fa = await this.check2faPrompt(page);
      if (needs2fa) break;
      alreadyLoggedIn = await this.checkLoggedIn(page);
      if (alreadyLoggedIn) break;
      logger.debug(
        { attempt: i + 1 },
        'threads auth: waiting for 2FA or redirect'
      );
    }

    if (needs2fa) {
      logger.info('threads auth: 2FA required');
      const totpRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
      const code = generateTOTP(creds.totpSecret);
      logger.info(
        { codeLength: code.length, totpWindowRemaining: totpRemaining },
        'threads auth: TOTP code generated'
      );
      const codeSelectors = [
        'input[autocomplete="one-time-code"]',
        'input[inputmode="numeric"]'
      ];
      if (!(await waitAndFill(page, codeSelectors, code, '2fa code'))) {
        return { success: false, error: 'Could not find 2FA input' };
      }
      const confirmSelectors: Selector[] = [
        { selector: 'div[role="button"]', hasText: 'Submit' },
        { selector: 'button', hasText: 'Submit' }
      ];
      await waitAndClick(page, confirmSelectors, '2fa confirm');

      // Wait for Threads to process 2FA and redirect away from login
      logger.info('threads auth: waiting for post-2FA redirect');
      try {
        await page.waitForURL((url) => !url.toString().includes('/login'), {
          timeout: 15000
        });
      } catch {
        logger.warn('threads auth: no redirect after 2FA submit');
      }
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});
      await page.waitForTimeout(2000);
    }

    // Navigate to English page before checking login state
    await page.goto(THREADS_BASE, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {});

    if (!(await this.checkLoggedIn(page))) {
      const diagnostic = await captureThreadsDiagnostics(
        page,
        'threads-auth-failed'
      );
      return { success: false, error: diagnostic || 'Login failed' };
    }

    return { success: true };
  }

  private async checkLoggedIn(page: Page): Promise<boolean> {
    const url = page.url();
    // If we're on the login page, we're not logged in
    if (url.includes('/login') || url.includes('/accounts/login')) {
      return false;
    }

    // Check for elements that only appear when logged in
    try {
      const loggedIn = await page.evaluate(() => {
        // Check for create/compose button (only visible when logged in)
        const createBtn =
          document.querySelector('[aria-label="Create"]') ||
          document.querySelector('a[href="/create"]') ||
          document.querySelector('svg[aria-label="Create"]');
        if (createBtn) return true;

        // Check for profile/avatar elements
        const avatar =
          document.querySelector('img[data-testid="user-avatar"]') ||
          document.querySelector('[aria-label="Profile"]');
        if (avatar) return true;

        // Check for nav bar with home/search/activity
        const homeLink = document.querySelector('a[href="/"]');
        const activityLink = document.querySelector('[aria-label="Activity"]');
        if (homeLink && activityLink) return true;

        return false;
      });
      return loggedIn;
    } catch {
      return false;
    }
  }

  private async check2faPrompt(page: Page): Promise<boolean> {
    try {
      // First check for 2FA input elements directly via locator (more reliable)
      const inputSelectors = ['input[autocomplete="one-time-code"]'];
      for (const sel of inputSelectors) {
        const count = await page.locator(sel).count();
        if (count > 0) return true;
      }

      // Fallback: check page text for 2FA-related keywords
      const has2fa = await page.evaluate(() => {
        const body = document.body.textContent?.toLowerCase() ?? '';
        return (
          body.includes('two-factor') ||
          body.includes('verification code') ||
          body.includes('security code') ||
          body.includes('authentication code') ||
          body.includes('confirm your identity') ||
          body.includes('enter the 6-digit code') ||
          body.includes('check your authentication app')
        );
      });
      return has2fa;
    } catch {
      return false;
    }
  }

  private async fillComposeArea(
    page: Page,
    text: string,
    partIndex: number
  ): Promise<boolean> {
    const composeSelectors = [
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'p[contenteditable="true"]'
    ];

    for (const sel of composeSelectors) {
      try {
        // For partIndex > 0, we want the last matching element (the newly added compose area)
        const elements = page.locator(sel);
        const count = await elements.count();
        if (count === 0) continue;

        // Use the last one for additional parts, first for the main post
        const targetIndex = partIndex > 0 ? count - 1 : 0;
        const el = elements.nth(targetIndex);
        await el.waitFor({ state: 'visible', timeout: 5000 });
        await typeIntoContentEditable(page, el, text);
        logger.info(
          { partIndex, selector: sel, elementIndex: targetIndex },
          'threads post: text entered'
        );
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private async uploadMediaForPart(
    page: Page,
    mediaPaths: string[]
  ): Promise<void> {
    if (mediaPaths.length === 0) return;

    const mediaInputSelectors = [
      'input[type="file"][accept*="image"]',
      'input[type="file"][accept*="video"]',
      'input[type="file"]'
    ];

    for (const sel of mediaInputSelectors) {
      try {
        const input = page.locator(sel).last();
        await input.waitFor({ state: 'attached', timeout: 5000 });
        await input.setInputFiles(mediaPaths, { timeout: 15000 });
        logger.info(
          { selector: sel, count: mediaPaths.length },
          'threads post: media uploaded'
        );
        // Wait for upload to process
        await page.waitForTimeout(3000);
        return;
      } catch {
        continue;
      }
    }
    logger.warn('threads post: could not find media input');
  }
}
