// #227 Click-through test of the demo build: opens the main screens and fails on any page crash.
// Run against `next start` with NEXT_PUBLIC_DEMO_MODE=true: node tests/e2e/smoke.mjs [url]
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:3000'
const problems = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))

async function step(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    problems.push(`${name}: ${error.message.split('\n')[0]}`)
    console.log(`✗ ${name}`)
    await page.screenshot({ path: `smoke-${name.replace(/\W+/g, '-')}.png` }).catch(() => {})
  }
}

await step('home loads', async () => {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByText('Your shared food map').waitFor({ timeout: 15000 })
  await page.waitForTimeout(2000) // let the page finish waking up before tapping
  // In dev the framework's corner badge sits over the first tab; it isn't there in a real build.
  await page.evaluate(() => document.querySelector('nextjs-portal')?.remove())
})
await step('open a place', async () => {
  await page.getByLabel('Search places').fill('Hana')
  await page.getByRole('button', { name: 'Open Hana Ramen' }).click()
  await page.getByRole('tab', { name: 'Our group' }).click() // the place page opens on the shared Overview
  await page.getByText('Group average').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Close Hana Ramen' }).click()
  await page.waitForTimeout(600)
  await page.getByLabel('Search places').fill('')
  await page.getByLabel('Search places').blur() // the tab bar hides while typing
  await page.waitForTimeout(400)
})
for (const tab of ['Map', 'Decide', 'Group', 'Places']) {
  await step(`${tab} tab`, async () => {
    await page
      .locator('nav[aria-label="Main"] button')
      .filter({ hasText: new RegExp(tab) })
      .click()
    await page.waitForTimeout(800)
  })
}
await step('quick log opens', async () => {
  await page.getByRole('button', { name: 'Quick log a visit' }).click()
  await page.getByText('Where are you eating?').waitFor({ timeout: 5000 })
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await page.waitForTimeout(600)
})
await step('settings and guidebook', async () => {
  // Reload on another tab: the page must come back on it without a server/browser mismatch.
  await page.locator('nav[aria-label="Main"] button').filter({ hasText: /Group/ }).click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.locator('header button').last().click()
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await page.getByText('Guidebook').first().click()
  await page.getByText('Tips & tricks').first().waitFor({ timeout: 5000 })
})

// Public pages: anyone with the link (no sign-in)
await step('public restaurant page', async () => {
  await page.goto(`${url}/r/etobicoke/lantern-pho`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Lantern Pho' }).waitFor({ timeout: 10000 })
  await page.getByRole('tab', { name: 'Menu' }).click()
  await page.getByText('Beef pho').first().waitFor({ timeout: 5000 })
  await page.getByRole('tab', { name: 'Info' }).click()
  await page.getByText('Hours').first().waitFor({ timeout: 5000 })
})
await step('unknown restaurant link', async () => {
  await page.goto(`${url}/r/etobicoke/nope`, { waitUntil: 'networkidle' })
  await page.getByText('couldn\'t find that restaurant').waitFor({ timeout: 5000 })
})
await step('public profile page', async () => {
  await page.goto(`${url}/u/mayaeats`, { waitUntil: 'networkidle' })
  await page.getByText('@mayaeats').waitFor({ timeout: 10000 })
})
await step('private profile link', async () => {
  await page.goto(`${url}/u/nobody`, { waitUntil: 'networkidle' })
  await page.getByText('This profile is private').waitFor({ timeout: 5000 })
})

await browser.close()
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('\nAll good')
