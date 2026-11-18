// U10 (Round 95): a trip's currency. Amounts logged on a trip are in it (no conversion).
export const CURRENCIES = [
  ['CAD', 'Canadian dollar'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'],
  ['MXN', 'Mexican peso'], ['JPY', 'Japanese yen'], ['KRW', 'Korean won'], ['CNY', 'Chinese yuan'],
  ['HKD', 'Hong Kong dollar'], ['TWD', 'New Taiwan dollar'], ['THB', 'Thai baht'], ['VND', 'Vietnamese dong'],
  ['PHP', 'Philippine peso'], ['INR', 'Indian rupee'], ['AUD', 'Australian dollar'], ['NZD', 'New Zealand dollar'],
  ['CHF', 'Swiss franc'], ['SEK', 'Swedish krona'], ['DKK', 'Danish krone'], ['NOK', 'Norwegian krone'],
  ['PLN', 'Polish złoty'], ['CZK', 'Czech koruna'], ['HUF', 'Hungarian forint'], ['TRY', 'Turkish lira'],
  ['AED', 'UAE dirham'], ['BRL', 'Brazilian real'], ['ARS', 'Argentine peso'], ['COP', 'Colombian peso'],
  ['PEN', 'Peruvian sol'], ['CLP', 'Chilean peso'], ['DOP', 'Dominican peso'], ['JMD', 'Jamaican dollar'],
  ['CUP', 'Cuban peso'], ['CRC', 'Costa Rican colón'], ['ZAR', 'South African rand'], ['MAD', 'Moroccan dirham'],
  ['EGP', 'Egyptian pound'], ['ISK', 'Icelandic króna'], ['SGD', 'Singapore dollar'], ['MYR', 'Malaysian ringgit'],
  ['IDR', 'Indonesian rupiah'],
] as const

/** "$1,234" / "€45.50" / "¥3,000" — whole numbers when there are no cents. */
export function money(amount: number, currency?: string | null) {
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : 'CAD'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: code === 'CAD' ? 'narrowSymbol' : 'symbol',
      minimumFractionDigits: amount % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(amount % 1 ? 2 : 0)}`
  }
}
