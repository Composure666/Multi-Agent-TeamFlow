import { expect, test, type Page } from '@playwright/test'

const MOCK_AGENT = 'E2E Mock'
const CONV_TITLE = `与 ${MOCK_AGENT} 的对话`

async function createChat(page: Page) {
  await page.getByRole('button', { name: '新建对话' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button').filter({ hasText: MOCK_AGENT }).first().click()
  await dialog.getByRole('button', { name: '创建' }).click()
  await expect(dialog).toBeHidden()
}

test('会话搜索过滤', async ({ page }) => {
  await page.goto('/')
  await createChat(page)

  const search = page.getByPlaceholder('搜索会话…')
  await search.fill('Mock')
  await expect(page.locator('aside').getByText(CONV_TITLE).first()).toBeVisible()

  await search.fill('zzzzz-no-match')
  await expect(page.getByText(/没有匹配/)).toBeVisible()
})

test('会话归档 → 取消归档', async ({ page }) => {
  await page.goto('/')
  await createChat(page)

  const sidebar = page.locator('aside')
  await expect(sidebar.getByText(CONV_TITLE).first()).toBeVisible()

  // hover 会话行 → 归档
  await sidebar.getByText(CONV_TITLE).first().hover()
  await page.getByTitle('归档').first().click()

  // 已归档区出现
  await expect(page.getByText(/已归档/)).toBeVisible()

  // 展开已归档 → hover 归档行 → 取消归档
  await page.getByText(/已归档/).click()
  const archivedRow = sidebar.getByText(CONV_TITLE).first()
  await archivedRow.hover()
  await page.getByTitle('取消归档').first().click()

  // 回到主列表（无「已归档」分组时它消失）
  await expect(sidebar.getByText(CONV_TITLE).first()).toBeVisible()
})
