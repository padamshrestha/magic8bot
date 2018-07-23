import { eventBus, EVENT, PeriodItem } from '@lib'
import { EMA, RSI } from '@plugins'

interface MacdOptions {
  period: string
  minPeriods: number
  emaShortPeriod: number
  emaLongPeriod: number
  signalPeriod: number
  upTrendThreshold: number
  downTrendThreshold: number
  overboughtRsiPeriods: number
  overboughtRsi: number
}

export class Macd {
  public readonly name: string = 'MACD'

  public options: MacdOptions = {
    period: '1h',
    minPeriods: 52,
    emaShortPeriod: 12,
    emaLongPeriod: 26,
    signalPeriod: 9,
    upTrendThreshold: 0,
    downTrendThreshold: 0,
    overboughtRsiPeriods: 25,
    overboughtRsi: 70,
  }

  private isPreroll = true

  private rsi = 0
  private avgGain = 0
  private avgLoss = 0

  private emaShort: number = null
  private emaLong: number = null
  private emaMacd: number = null

  private periods: {
    macd: number
    history: number
  }[] = [{ macd: null, history: null }]

  private overbought = false

  constructor(exchange: string, selector: string, options?: Partial<MacdOptions>) {
    this.options = { ...this.options, ...options }

    const eventBusEvent = { exchange, selector, strategy: this.name }

    eventBus.subscribe({ event: EVENT.TRADE, ...eventBusEvent }, (periods: PeriodItem[]) => this.calculate(periods))

    eventBus.subscribe({ event: EVENT.PERIOD, ...eventBusEvent }, () => this.onPeriod())
  }

  public calculate(periods: PeriodItem[]) {
    this.checkOverbought(periods)
    this.getEmaShort(periods)
    this.getEmaLong(periods)

    this.calculateMacd()
  }

  public calculateMacd() {
    if (this.emaShort && this.emaLong) {
      const macd = this.emaShort - this.emaLong
      this.periods[0].macd = macd
      this.getEmaMacd()
      if (this.emaMacd) {
        this.periods[0].history = macd - this.emaMacd
      }
    }
  }

  public getEmaShort(periods: PeriodItem[]) {
    this.emaShort = EMA.calculate(this.emaShort, periods as any, this.options.emaShortPeriod)
  }

  public getEmaLong(periods: PeriodItem[]) {
    this.emaLong = EMA.calculate(this.emaLong, periods as any, this.options.emaLongPeriod)
  }

  public getEmaMacd() {
    this.emaMacd = EMA.calculate(this.emaMacd, this.periods, this.options.signalPeriod, 'macd')
  }

  public checkOverbought(periods: PeriodItem[]) {
    const { rsi, avgGain, avgLoss } = RSI.calculate(
      this.avgGain,
      this.avgLoss,
      periods,
      this.options.overboughtRsiPeriods
    )

    this.rsi = rsi
    this.avgGain = avgGain
    this.avgLoss = avgLoss
    this.overbought = !this.isPreroll && rsi >= this.options.overboughtRsi && !this.overbought
  }

  public onPeriod() {
    if (!this.isPreroll && this.rsi && this.overbought) {
      this.overbought = false
      return 'sell'
    }

    const [{ history }, { history: lastHistory }] = this.periods

    if (history && lastHistory) {
      const { upTrendThreshold } = this.options
      if (history - upTrendThreshold > 0 && lastHistory - upTrendThreshold <= 0) return 'buy'

      const { downTrendThreshold } = this.options
      if (history + downTrendThreshold < 0 && lastHistory + downTrendThreshold >= 0) return 'sell'

      return null
    }

    this.newPeriod()
  }

  public newPeriod() {
    this.periods.push({ macd: null, history: null })
  }

  public prerollDone() {
    this.isPreroll = false
  }
}
