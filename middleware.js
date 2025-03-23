const { metrics } = require('@opentelemetry/api');

let {activeRequests} = require('./instrumentation.js');

const {
  inFlightRequests,
  requestSize,
  responseSize,
  requestCount,
  requestDuration,
  requestErrors,
  networkLatency,
  requestConcurrency,
} = require('./instrumentation.js');

const requestMetricsMiddleware = (req, res, next) => {
  const startTime = process.hrtime();

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
}

module.exports = requestMetricsMiddleware;
