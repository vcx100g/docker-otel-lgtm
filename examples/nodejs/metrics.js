const { trace, metrics } = require('@opentelemetry/api')

const meter = metrics.getMeter('dice-lib')

// ✅ Total number of HTTP requests
const requestCount = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests received',
});

// ✅ Histogram for request duration
const requestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'Duration of HTTP requests in seconds',
  boundaries: [0.1, 0.3, 1.5, 5, 10], // Define custom bucket boundaries
});

// ✅ Histogram for request size in bytes
const requestSize = meter.createHistogram('http_request_size_bytes', {
  description: 'Size of incoming HTTP requests in bytes',
  boundaries: [100, 500, 1000, 5000, 10000], // Adjust based on expected request sizes
});

// ✅ Histogram for response size in bytes
const responseSize = meter.createHistogram('http_response_size_bytes', {
  description: 'Size of outgoing HTTP responses in bytes',
  boundaries: [100, 500, 1000, 5000, 10000],
});

// ✅ Gauge for in-flight requests (concurrent active requests)
const inFlightRequests = meter.createUpDownCounter('http_in_flight_requests', {
  description: 'Number of in-flight HTTP requests being processed',
});

// ✅ Counter for failed HTTP requests (errors)
const requestErrors = meter.createCounter('http_requests_errors_total', {
  description: 'Total number of failed HTTP requests',
});

module.exports = {
  requestCount,
  requestDuration,
  requestSize,
  responseSize,
  inFlightRequests,
  requestErrors,
};
