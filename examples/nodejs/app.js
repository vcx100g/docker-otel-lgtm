require('./instrumentation')
const { trace, metrics, SpanStatusCode } = require('@opentelemetry/api')
const express = require('express')
const { rollTheDice } = require('./dice.js')
const { Logger } = require('./logger.js')
const { Resource } = require('@opentelemetry/resources')
const {
  inFlightRequests,
  requestSize,
  responseSize,
  requestCount,
  requestDuration,
  requestErrors,
  networkLatency,
  requestConcurrency,
  
} = require('./instrumentation.js')

let {activeRequests} = require('./instrumentation.js')

const tracer = trace.getTracer('dice-server', '0.1.0')

const logger = new Logger('dice-server')

// const meter = metrics.getMeter('dice-lib')

const PORT = parseInt(process.env.PORT || '8084')
const app = express()

app.use((req, res, next) => {
  const startTime = process.hrtime()

  // ✅ Track in-flight requests
  activeRequests += 1;
  inFlightRequests.add(1)

  // ✅ Measure request size (approximate using content-length header)
  const requestContentLength = parseInt(
    req.headers['content-length'] || '0',
    10
  )
  requestSize.record(requestContentLength, {
    method: req.method,
    route: req.path
  })


  // ✅ Track network latency (time before request starts processing)
  setImmediate(() => { // ✅ Measure just before entering next middleware
    const duration = process.hrtime(startTime);
    const latencyInSeconds = duration[0] + duration[1] / 1e9;
    networkLatency.record(latencyInSeconds, { method: req.method, route: req.path });
  });

  res.on('finish', () => {
    const duration = process.hrtime(startTime)
    const durationInSeconds = duration[0] + duration[1] / 1e9

    activeRequests -= 1; // ✅ Decrease active requests
    // ✅ Decrease in-flight requests
    inFlightRequests.add(-1)

    // ✅ Measure response size (approximate using content-length header)
    const responseContentLength = parseInt(
      res.getHeader('content-length') || '0',
      10
    )
    responseSize.record(responseContentLength, {
      method: req.method,
      route: req.path,
      status: res.statusCode
    })

    // ✅ Increment request count
    requestCount.add(1, {
      method: req.method,
      route: req.path,
      status: res.statusCode
    })

    // ✅ Record request duration
    requestDuration.record(durationInSeconds, {
      method: req.method,
      route: req.path,
      status: res.statusCode
    })

    // ✅ Track errors (if status code is 4xx or 5xx)
    if (res.statusCode >= 400) {
      requestErrors.add(1, {
        method: req.method,
        route: req.path,
        status: res.statusCode
      })
    }
  })

  next()
})

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
