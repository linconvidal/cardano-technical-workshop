import { defaultLocale, resolveLocale, type Locale } from "./catalog.js"

export const formatDateTime = (
  value: Date | number | string,
  requestedLocale: Locale | string = defaultLocale,
  options: Intl.DateTimeFormatOptions = {},
): string => new Intl.DateTimeFormat(resolveLocale(requestedLocale), options).format(
  value instanceof Date ? value : new Date(value),
)

export type ScaledBigIntFormatOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  useGrouping?: boolean
}

export const formatScaledBigInt = (
  value: bigint,
  scale: number | bigint,
  requestedLocale: Locale | string = defaultLocale,
  options: ScaledBigIntFormatOptions = {},
): string => {
  const decimalPlaces = decimalPlacesForScale(scale)
  const minimum = options.minimumFractionDigits ?? 0
  const maximum = options.maximumFractionDigits ?? decimalPlaces
  validateFractionDigits(minimum, maximum)

  const displayedPlaces = Math.min(decimalPlaces, maximum)
  const reduction = decimalPlaces - displayedPlaces
  const roundingDivisor = 10n ** BigInt(reduction)
  const absolute = value < 0n ? -value : value
  const rounded = reduction === 0
    ? absolute
    : (absolute + roundingDivisor / 2n) / roundingDivisor
  const displayDivisor = 10n ** BigInt(displayedPlaces)
  const integer = rounded / displayDivisor
  const fractionValue = rounded % displayDivisor
  const locale = resolveLocale(requestedLocale)
  const groupedInteger = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: options.useGrouping ?? true,
  }).format(integer)

  let fraction = displayedPlaces === 0 ? "" : fractionValue.toString().padStart(displayedPlaces, "0")
  while (fraction.length > minimum && fraction.endsWith("0")) fraction = fraction.slice(0, -1)
  if (fraction.length < minimum) fraction = fraction.padEnd(minimum, "0")

  const sign = value < 0n && rounded !== 0n ? "-" : ""
  if (!fraction) return `${sign}${groupedInteger}`
  return `${sign}${groupedInteger}${decimalSeparator(locale)}${fraction}`
}

const decimalPlacesForScale = (scale: number | bigint): number => {
  if (typeof scale === "number") {
    if (Number.isInteger(scale) && scale >= 0 && scale <= 100) return scale
    throw new RangeError("scale must be an integer from 0 through 100")
  }

  if (scale < 1n) throw new RangeError("scale divisor must be a positive power of ten")
  let divisor = scale
  let places = 0
  while (divisor > 1n && divisor % 10n === 0n) {
    divisor /= 10n
    places += 1
  }
  if (divisor !== 1n || places > 100) throw new RangeError("scale divisor must be a power of ten up to 10^100")
  return places
}

const validateFractionDigits = (minimum: number, maximum: number) => {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < minimum || maximum > 100) {
    throw new RangeError("fraction digits must be integers with 0 <= minimum <= maximum <= 100")
  }
}

const decimalSeparator = (locale: Locale): string =>
  new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? "."
