require('./instrumentation')
const { trace, metrics, SpanStatusCode } = require('@opentelemetry/api')
const express = require('express')
const { rollTheDice } = require('./dice.js')
const { Logger } = require('./logger.js')
const { Resource } = require('@opentelemetry/resources')
const requestMetricsMiddleware = require('./middleware.js');

const tracer = trace.getTracer('dice-server', '0.1.0')

const logger = new Logger('dice-server')

// const meter = metrics.getMeter('dice-lib')

const PORT = parseInt(process.env.PORT || '8084')
const app = express()

app.use(requestMetricsMiddleware);

app.get('/rolldice', (req, res) => {
  return tracer.startActiveSpan('rollDice', (span) => {
    logger.log('Received request to roll dice')
    const rolls = req.query.rolls ? parseInt(req.query.rolls.toString()) : NaN
    if (isNaN(rolls)) {
      const errorMessage =
        "Request parameter 'rolls' is missing or not a number."
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      })
      logger.error(errorMessage)
      res.status(400).send(errorMessage)
      span.end()
      return
    }

    // Introduce a 1/10 chance of triggering an error
    if (Math.random() < 0.1) {
      const errorMessage = 'Random error occurred.'
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      })
      logger.error(errorMessage)
      res.status(500).send(errorMessage)
      span.end()
      return
    }

    if (Math.random() < 0.2) {
      const errorMessage = 'Random 4xx error occurred.'
      const statusCode = Math.random() < 0.5 ? 400 : 403
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      })
      logger.error(errorMessage)
      res.status(statusCode).send(errorMessage)
      span.end()
      return
    }

    const result = JSON.stringify(rollTheDice(rolls, 1, 6))
    span.end()
    res.send(result)
  })
})

app.listen(PORT, () => {
  console.log(`Listening for requests on http://localhost:${PORT}`)
})
