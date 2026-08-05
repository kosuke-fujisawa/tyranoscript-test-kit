import { expect } from "@playwright/test";

/**
 * メッセージ領域をクリックして、対象が表示されるまで進める。
 * ティラノは「1クリック目=文字送り完了、2クリック目=次ページ」の挙動を持つため、
 * 固定回数ではなく表示されるまでクリックする方式にしている。
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} target
 * @param {number} [maxClicks]
 * @param {{ x?: number, y?: number }} [clickPoint] メッセージ領域をクリックする座標(既定: 640,620)
 */
export async function advanceUntil(page, target, maxClicks = 60, clickPoint = { x: 640, y: 620 }) {
  for (let i = 0; i < maxClicks; i++) {
    if (await target.isVisible().catch(() => false)) return;
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await target.waitFor({ state: "visible", timeout: 200 }).catch(() => {});
  }
  await expect(target).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string | RegExp} text
 * @param {number} [maxClicks]
 */
export async function advanceUntilVisible(page, text, maxClicks = 60) {
  await advanceUntil(page, page.getByText(text).first(), maxClicks);
}

/** glinkボタン(テキストリンク)のロケータを返す */
export function glink(page, hasText) {
  return page.locator(".glink_button", { hasText }).first();
}

/**
 * glinkボタンをクリックする。glinkの文字はtextillateでアニメーション表示されており、
 * DOM上に現れて`toBeVisible`が真になった直後はまだクリックハンドラが未バインドな
 * 瞬間があるため(アニメーション完了コールバックでバインドされる)、クリックが
 * まれに無視されることがある。同じテキストのボタンがクリック後も残っていれば
 * 遷移していないとみなし、消えるまで数回リトライする。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} hasText
 * @param {number} [maxAttempts]
 * @throws {Error} maxAttempts回クリックしてもボタンが消えず、遷移を確認できなかった場合
 */
export async function clickGlink(page, hasText, maxAttempts = 5) {
  const target = glink(page, hasText);
  await expect(target).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await target.click();
    await page.waitForTimeout(400);
    if (!(await glink(page, hasText).isVisible().catch(() => false))) return;
  }
  throw new Error(`clickGlink("${hasText}"): ${maxAttempts}回クリックしても遷移を確認できませんでした`);
}

/**
 * タイトル画面を開いて指定ボタンの表示を待つ(初回はエンジン起動があるため長めに待つ)。
 * buttonTextは各作品のタイトルメニューの実際の文言を渡す(例: "Start", "1. START")。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} buttonText
 */
export async function openTitle(page, buttonText) {
  await page.goto("/");
  await expect(glink(page, buttonText)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

/**
 * 文字送りアニメーションの完了を待つ。
 * 文字送り中(is_adding_text=true)にセーブするとそのフラグごと保存され、
 * ロード後にクリック受付が復元されないため、セーブ前に必ず呼ぶこと。
 *
 * @param {import('@playwright/test').Page} page
 */
export async function waitForTextSettled(page) {
  await page.waitForFunction(
    () => window.TYRANO?.kag?.stat?.is_adding_text === false,
    undefined,
    { timeout: 10_000 },
  );
}
